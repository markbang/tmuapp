package dev.tmuapp.mobile

import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

private val JsonMediaType = "application/json; charset=utf-8".toMediaType()
private val HttpClient = OkHttpClient.Builder()
    .connectTimeout(5, TimeUnit.SECONDS)
    .readTimeout(8, TimeUnit.SECONDS)
    .writeTimeout(8, TimeUnit.SECONDS)
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
    val lines: Int,
    val columns: Int,
    val rows: Int,
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
    return PaneCapture(
        target = json.optString("target"),
        ansi = stripAnsi(json.optString("ansi")),
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

private fun stripAnsi(value: String): String =
    value.replace(Regex("\\u001B\\[[;?0-9]*[ -/]*[@-~]"), "")
