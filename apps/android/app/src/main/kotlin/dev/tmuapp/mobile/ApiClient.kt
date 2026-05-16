package dev.tmuapp.mobile

import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Request.Builder
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject

private val JsonMediaType = "application/json; charset=utf-8".toMediaType()
private val HttpClient = OkHttpClient.Builder()
    .connectTimeout(5, TimeUnit.SECONDS)
    .readTimeout(8, TimeUnit.SECONDS)
    .writeTimeout(8, TimeUnit.SECONDS)
    .build()
private val WebSocketClient = OkHttpClient.Builder()
    .connectTimeout(5, TimeUnit.SECONDS)
    .readTimeout(0, TimeUnit.MILLISECONDS)  // no read timeout for streams
    .build()

data class TmuxSession(
    val id: String,
    val name: String,
    val windows: Int,
    val attached: Boolean,
    val createdAt: Long,
)

data class TmuxWindow(
    val id: String,
    val index: Int,
    val name: String,
    val active: Boolean,
    val panes: Int,
    val layout: String,
)

data class TmuxPane(
    val id: String,
    val index: Int,
    val title: String,
    val active: Boolean,
    val width: Int,
    val height: Int,
    val currentCommand: String,
    val currentPath: String,
)

data class TmuxSnapshot(
    val sessions: List<TmuxSession> = emptyList(),
    val windows: Map<String, List<TmuxWindow>> = emptyMap(),
    val panes: Map<String, List<TmuxPane>> = emptyMap(),
)

data class PaneCapture(
    val target: String,
    val ansi: String,
    val rawAnsi: String,
    val lines: Int,
    val columns: Int,
    val rows: Int,
)

data class StreamConnection(
    val isOpen: Boolean,
    val close: () -> Unit,
    val sendInput: (String) -> Unit,
    val sendResize: (Int, Int) -> Unit,
)

class TmuappApiClient(
    private val apiBase: String,
    private val apiToken: String?,
) {
    suspend fun health(): Boolean = withContext(Dispatchers.IO) {
        val response = request("GET", "/health")
        JSONObject(response).optBoolean("ok", false)
    }

    suspend fun snapshot(): TmuxSnapshot = withContext(Dispatchers.IO) {
        parseSnapshot(JSONObject(request("GET", "/api/sessions")))
    }

    suspend fun createSession(name: String, cwd: String?): TmuxSnapshot = withContext(Dispatchers.IO) {
        val body = JSONObject().put("name", name.trim())
        if (!cwd.isNullOrBlank()) {
            body.put("cwd", cwd.trim())
        }
        parseSnapshot(JSONObject(request("POST", "/api/sessions", body.toString())))
    }

    suspend fun killSession(sessionId: String): TmuxSnapshot = withContext(Dispatchers.IO) {
        parseSnapshot(JSONObject(request("DELETE", "/api/sessions/${urlEncode(sessionId)}")))
    }

    suspend fun killWindow(windowId: String): TmuxSnapshot = withContext(Dispatchers.IO) {
        parseSnapshot(JSONObject(request("DELETE", "/api/windows/${urlEncode(windowId)}")))
    }

    suspend fun splitPane(paneId: String, direction: String): TmuxSnapshot = withContext(Dispatchers.IO) {
        val body = JSONObject().put("direction", direction)
        parseSnapshot(JSONObject(request("POST", "/api/panes/${urlEncode(paneId)}/split", body.toString())))
    }

    suspend fun sendInput(paneId: String, data: String) = withContext(Dispatchers.IO) {
        val body = JSONObject().put("data", data)
        request("POST", "/api/panes/${urlEncode(paneId)}/input", body.toString())
    }

    suspend fun sendEnter(paneId: String) = withContext(Dispatchers.IO) {
        val body = JSONObject().put("keys", JSONArray().put("Enter"))
        request("POST", "/api/panes/${urlEncode(paneId)}/keys", body.toString())
    }

    suspend fun capturePane(paneId: String, lines: Int = 120): PaneCapture = withContext(Dispatchers.IO) {
        parseCapture(JSONObject(request("GET", "/api/panes/${urlEncode(paneId)}/capture?lines=$lines")))
    }

    fun connectStream(
        paneId: String,
        onOutput: (String) -> Unit,
        onError: (String) -> Unit,
        onClose: () -> Unit,
    ): StreamConnection {
        val wsUrl = streamUrl(paneId)
        val wsRequest = Builder().url(wsUrl).build()
        var socket: WebSocket? = null

        val listener = object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                socket = webSocket
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val json = JSONObject(text)
                    when (json.optString("type")) {
                        "output" -> {
                            val data = json.optString("data", "")
                            if (data.isNotEmpty()) onOutput(data)
                        }
                        "error" -> onError(json.optString("message", "Stream error"))
                    }
                } catch (_: Exception) { /* ignore malformed messages */ }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                onError(t.message ?: "WebSocket connection failed")
                onClose()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                onClose()
            }
        }

        val ws = WebSocketClient.newWebSocket(wsRequest, listener)

        return StreamConnection(
            isOpen = true,
            close = { ws.close(1000, "client close") },
            sendInput = { data ->
                val msg = JSONObject().apply {
                    put("type", "input")
                    put("data", data)
                }
                ws.send(msg.toString())
            },
            sendResize = { cols, rows ->
                val msg = JSONObject().apply {
                    put("type", "resize")
                    put("columns", cols)
                    put("rows", rows)
                }
                ws.send(msg.toString())
            },
        )
    }

    private fun streamUrl(paneId: String): String {
        val base = apiBase.trim().trimEnd('/')
        val httpUrl = "$base/api/panes/${urlEncode(paneId)}/stream"
        val wsUrl = httpUrl.replace("https://", "wss://").replace("http://", "ws://")
        return if (apiToken?.trim().isNullOrBlank()) wsUrl else "$wsUrl?token=${urlEncode(apiToken!!.trim())}"
    }

    private fun request(method: String, path: String, body: String? = null): String {
        val base = apiBase.trim().trimEnd('/')
        require(base.isNotBlank()) { "API address is required" }

        val request = Request.Builder()
            .url(base + path)
            .method(method, body?.toRequestBody(JsonMediaType))
            .apply {
                val token = apiToken?.trim().orEmpty()
                if (token.isNotBlank()) {
                    header("Authorization", "Bearer $token")
                }
            }
            .build()

        HttpClient.newCall(request).execute().use { response ->
            val responseBody = response.body.string()
            if (!response.isSuccessful) {
                val error = runCatching { JSONObject(responseBody).optString("error") }.getOrNull()
                throw IllegalStateException(error?.ifBlank { null } ?: "HTTP ${response.code}")
            }
            return responseBody
        }
    }
}

fun urlEncode(value: String): String =
    URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20")

private fun parseSnapshot(json: JSONObject): TmuxSnapshot {
    val sessions = json.optJSONArray("sessions").toSessionList()
    val windows = mutableMapOf<String, List<TmuxWindow>>()
    val panes = mutableMapOf<String, List<TmuxPane>>()

    val windowsJson = json.optJSONObject("windows") ?: JSONObject()
    windowsJson.keys().forEach { key ->
        windows[key] = windowsJson.optJSONArray(key).toWindowList()
    }

    val panesJson = json.optJSONObject("panes") ?: JSONObject()
    panesJson.keys().forEach { key ->
        panes[key] = panesJson.optJSONArray(key).toPaneList()
    }

    return TmuxSnapshot(sessions = sessions, windows = windows, panes = panes)
}

private fun parseCapture(json: JSONObject): PaneCapture {
    val terminal = json.optJSONObject("terminal") ?: JSONObject()
    val raw = json.optString("ansi")
    return PaneCapture(
        target = json.optString("target"),
        ansi = normalizeAnsi(raw),
        rawAnsi = raw,
        lines = json.optInt("lines"),
        columns = terminal.optInt("columns"),
        rows = terminal.optInt("rows"),
    )
}

private fun JSONArray?.toSessionList(): List<TmuxSession> = mapJson { item ->
    TmuxSession(
        id = item.optString("id"),
        name = item.optString("name"),
        windows = item.optInt("windows"),
        attached = item.optBoolean("attached"),
        createdAt = item.optLong("createdAt"),
    )
}

private fun JSONArray?.toWindowList(): List<TmuxWindow> = mapJson { item ->
    TmuxWindow(
        id = item.optString("id"),
        index = item.optInt("index"),
        name = item.optString("name"),
        active = item.optBoolean("active"),
        panes = item.optInt("panes"),
        layout = item.optString("layout"),
    )
}

private fun JSONArray?.toPaneList(): List<TmuxPane> = mapJson { item ->
    TmuxPane(
        id = item.optString("id"),
        index = item.optInt("index"),
        title = item.optString("title"),
        active = item.optBoolean("active"),
        width = item.optInt("width"),
        height = item.optInt("height"),
        currentCommand = item.optString("currentCommand"),
        currentPath = item.optString("currentPath"),
    )
}

private fun <T> JSONArray?.mapJson(transform: (JSONObject) -> T): List<T> {
    if (this == null) {
        return emptyList()
    }
    return List(length()) { index -> transform(optJSONObject(index) ?: JSONObject()) }
}

/**
 * Add \r before bare \n so the terminal cursor resets to column 0 on each
 * new line. Mirrors normalizeAnsi() in the web terminal-protocol.ts.
 */
private fun normalizeAnsi(ansi: String): String {
    val sb = StringBuilder(ansi.length + 16)
    for (i in ansi.indices) {
        if (ansi[i] == '\n' && (i == 0 || ansi[i - 1] != '\r')) {
            sb.append("\r\n")
        } else {
            sb.append(ansi[i])
        }
    }
    return sb.toString()
}
