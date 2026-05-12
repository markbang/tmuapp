package dev.tmuapp.mobile

import android.content.Context
import android.graphics.Typeface
import android.os.Bundle
import android.util.Log
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.system.exitProcess

private val Canvas = Color(0xFF010102)
private val Surface1 = Color(0xFF0F1011)
private val Surface2 = Color(0xFF141516)
private val Primary = Color(0xFF5E6AD2)
private val Ink = Color(0xFFF7F8F8)
private val InkMuted = Color(0xFF8A8F98)
private val Stroke = Color(0xFF2A2B30)
private const val CrashPrefs = "tmuapp.crash"
private const val LastCrash = "lastCrash"

class MainActivity : ComponentActivity() {
    private val crashPrefs by lazy { getSharedPreferences(CrashPrefs, Context.MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        installCrashRecorder()
        super.onCreate(savedInstanceState)
        window.statusBarColor = android.graphics.Color.rgb(1, 1, 2)
        window.navigationBarColor = android.graphics.Color.rgb(1, 1, 2)

        val previousCrash = crashPrefs.getString(LastCrash, null)
        if (previousCrash != null) {
            showCrashFallback(previousCrash)
            return
        }

        try {
            setContent { TmuappClient() }
        } catch (throwable: Throwable) {
            recordCrash(throwable)
            showCrashFallback(Log.getStackTraceString(throwable))
        }
    }

    private fun installCrashRecorder() {
        val previousHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            recordCrash(throwable)
            if (previousHandler != null) {
                previousHandler.uncaughtException(thread, throwable)
            } else {
                exitProcess(2)
            }
        }
    }

    private fun recordCrash(throwable: Throwable) {
        crashPrefs.edit()
            .putString(LastCrash, Log.getStackTraceString(throwable))
            .commit()
    }

    private fun showCrashFallback(crash: String) {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 32, 32, 32)
            setBackgroundColor(android.graphics.Color.rgb(1, 1, 2))
        }
        val title = TextView(this).apply {
            text = "tmuapp startup recovery"
            setTextColor(android.graphics.Color.rgb(247, 248, 248))
            textSize = 20f
            typeface = Typeface.DEFAULT_BOLD
        }
        val body = TextView(this).apply {
            text = crash
            setTextColor(android.graphics.Color.rgb(247, 248, 248))
            textSize = 12f
            typeface = Typeface.MONOSPACE
            setPadding(0, 24, 0, 24)
        }
        val clear = Button(this).apply {
            text = "Clear crash and retry"
            setOnClickListener {
                crashPrefs.edit().remove(LastCrash).apply()
                recreate()
            }
        }
        root.addView(title)
        root.addView(ScrollView(this).apply { addView(body) }, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f,
        ))
        root.addView(clear)
        setContentView(root)
    }
}

@Composable
private fun TmuappClient() {
    var apiBase by rememberSaveable { mutableStateOf("http://10.0.2.2:8787") }
    var apiToken by rememberSaveable { mutableStateOf("") }
    var sessionName by rememberSaveable { mutableStateOf("work") }
    var target by rememberSaveable { mutableStateOf("%1") }
    var paneInput by rememberSaveable { mutableStateOf("pwd") }
    var output by remember { mutableStateOf("Ready.") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun runRequest(method: String, path: String, body: String? = null) {
        val base = apiBase.trim().trimEnd('/')
        val token = apiToken.trim().ifBlank { null }
        output = "$method $path..."
        busy = true
        scope.launch {
            output = try {
                executeRequest(base, token, method, path, body)
            } catch (exception: Exception) {
                exception.toString()
            } finally {
                busy = false
            }
        }
    }

    val actions = listOf(
        Action("Health") { runRequest("GET", "/health") },
        Action("Refresh sessions") { runRequest("GET", "/api/sessions") },
        Action("Create session") {
            runRequest("POST", "/api/sessions", """{"name":"${jsonEscape(sessionName)}"}""")
        },
        Action("Kill target session") {
            runRequest("DELETE", "/api/sessions/${urlEncode(target)}")
        },
        Action("Capture pane") {
            runRequest("GET", "/api/panes/${urlEncode(target)}/capture?lines=120")
        },
        Action("Send input") {
            runRequest("POST", "/api/panes/${urlEncode(target)}/input", """{"data":"${jsonEscape(paneInput)}"}""")
        },
        Action("Send Enter") {
            runRequest("POST", "/api/panes/${urlEncode(target)}/keys", """{"keys":["Enter"]}""")
        },
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Canvas)
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Header()
        ClientField(
            label = "API base URL",
            value = apiBase,
            onValueChange = { apiBase = it },
            keyboardType = KeyboardType.Uri,
        )
        ClientField("API token", apiToken, { apiToken = it })
        ClientField("Session name", sessionName, { sessionName = it })
        ClientField("tmux target", target, { target = it })
        ClientField("Pane input", paneInput, { paneInput = it })
        ActionGrid(actions = actions, enabled = !busy)
        OutputPanel(text = output)
    }
}

@Composable
private fun Header() {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        BasicText(
            text = "tmuapp",
            style = TextStyle(
                color = Ink,
                fontSize = 28.sp,
                lineHeight = 32.sp,
                fontWeight = FontWeight.SemiBold,
            ),
        )
        BasicText(
            text = "tmux sessions, panes, ANSI capture",
            style = TextStyle(
                color = InkMuted,
                fontSize = 14.sp,
                lineHeight = 20.sp,
            ),
        )
    }
}

@Composable
private fun ClientField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        BasicText(
            text = label,
            style = TextStyle(color = InkMuted, fontSize = 12.sp, lineHeight = 16.sp),
        )
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .fillMaxWidth()
                .height(44.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Surface1)
                .border(1.dp, Stroke, RoundedCornerShape(8.dp))
                .padding(horizontal = 12.dp, vertical = 12.dp),
            singleLine = true,
            textStyle = TextStyle(color = Ink, fontSize = 14.sp, lineHeight = 20.sp),
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.None,
                keyboardType = keyboardType,
            ),
        )
    }
}

@Composable
private fun ActionGrid(actions: List<Action>, enabled: Boolean) {
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val columns = if (maxWidth >= 560.dp) 2 else 1
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            actions.chunked(columns).forEach { rowActions ->
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    rowActions.forEach { action ->
                        ActionButton(
                            label = action.label,
                            enabled = enabled,
                            onClick = action.onClick,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    repeat(columns - rowActions.size) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun ActionButton(
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val background = if (enabled) Primary else Surface2
    val content = if (enabled) Ink else InkMuted
    Box(
        modifier = modifier
            .height(48.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(background)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(
            text = label,
            style = TextStyle(color = content, fontSize = 14.sp, lineHeight = 18.sp),
        )
    }
}

@Composable
private fun OutputPanel(text: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 220.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Surface2)
            .padding(16.dp),
    ) {
        BasicText(
            text = text.ifBlank { " " },
            style = TextStyle(
                color = Ink,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                lineHeight = 17.sp,
            ),
        )
    }
}

private data class Action(
    val label: String,
    val onClick: () -> Unit,
)

private suspend fun executeRequest(
    apiBase: String,
    apiToken: String?,
    method: String,
    path: String,
    body: String?,
): String = withContext(Dispatchers.IO) {
    val connection = (URL(apiBase + path).openConnection() as HttpURLConnection).apply {
        requestMethod = method
        connectTimeout = 5_000
        readTimeout = 5_000
        if (apiToken != null) {
            setRequestProperty("Authorization", "Bearer $apiToken")
        }
        if (body != null) {
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            doOutput = true
        }
    }

    try {
        if (body != null) {
            connection.outputStream.use { stream: OutputStream ->
                stream.write(body.toByteArray(StandardCharsets.UTF_8))
            }
        }

        val code = connection.responseCode
        val responseBody = readStream(if (code >= 400) connection.errorStream else connection.inputStream)
        "HTTP $code\n$responseBody"
    } finally {
        connection.disconnect()
    }
}

private fun urlEncode(value: String): String =
    URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20")

private fun jsonEscape(value: String): String =
    value
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")

private fun readStream(stream: InputStream?): String {
    if (stream == null) {
        return ""
    }

    return BufferedReader(InputStreamReader(stream, StandardCharsets.UTF_8)).use { reader ->
        buildString {
            var line = reader.readLine()
            while (line != null) {
                append(line).append('\n')
                line = reader.readLine()
            }
        }
    }
}
