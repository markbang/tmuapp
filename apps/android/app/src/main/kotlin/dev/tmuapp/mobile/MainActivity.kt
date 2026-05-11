package dev.tmuapp.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
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

private val Canvas = Color(0xFF010102)
private val Surface1 = Color(0xFF0F1011)
private val Surface2 = Color(0xFF141516)
private val Primary = Color(0xFF5E6AD2)
private val Ink = Color(0xFFF7F8F8)
private val InkMuted = Color(0xFF8A8F98)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = android.graphics.Color.rgb(1, 1, 2)
        window.navigationBarColor = android.graphics.Color.rgb(1, 1, 2)

        setContent {
            TmuappTheme {
                TmuappClient()
            }
        }
    }
}

@Composable
private fun TmuappTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Primary,
            background = Canvas,
            surface = Surface1,
            surfaceVariant = Surface2,
            onPrimary = Ink,
            onBackground = Ink,
            onSurface = Ink,
            onSurfaceVariant = InkMuted,
        ),
        content = content,
    )
}

@Composable
private fun TmuappClient() {
    var apiBase by rememberSaveable { mutableStateOf("http://10.0.2.2:8787") }
    var sessionName by rememberSaveable { mutableStateOf("work") }
    var target by rememberSaveable { mutableStateOf("%1") }
    var paneInput by rememberSaveable { mutableStateOf("pwd") }
    var output by remember { mutableStateOf("Ready.") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun runRequest(method: String, path: String, body: String? = null) {
        val base = apiBase.trim().trimEnd('/')
        output = "$method $path..."
        busy = true
        scope.launch {
            output = try {
                executeRequest(base, method, path, body)
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

    Scaffold(
        containerColor = Canvas,
        contentColor = Ink,
    ) { contentPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Canvas)
                .padding(contentPadding)
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
            ClientField("Session name", sessionName, { sessionName = it })
            ClientField("tmux target", target, { target = it })
            ClientField("Pane input", paneInput, { paneInput = it })
            ActionGrid(actions = actions, enabled = !busy)
            OutputPanel(text = output)
        }
    }
}

@Composable
private fun Header() {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            text = "tmuapp",
            color = Ink,
            fontSize = 28.sp,
            lineHeight = 32.sp,
        )
        Text(
            text = "tmux sessions, panes, ANSI capture",
            color = InkMuted,
            fontSize = 14.sp,
            lineHeight = 20.sp,
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
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier.fillMaxWidth(),
        label = { Text(label) },
        singleLine = true,
        textStyle = LocalTextStyle.current.copy(color = Ink),
        keyboardOptions = KeyboardOptions(
            capitalization = KeyboardCapitalization.None,
            keyboardType = keyboardType,
        ),
    )
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
                        Button(
                            onClick = action.onClick,
                            enabled = enabled,
                            modifier = Modifier
                                .weight(1f)
                                .height(48.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Primary,
                                contentColor = Ink,
                                disabledContainerColor = Surface2,
                                disabledContentColor = InkMuted,
                            ),
                            shape = RoundedCornerShape(8.dp),
                        ) {
                            Text(text = action.label, fontSize = 14.sp)
                        }
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
private fun OutputPanel(text: String) {
    val scrollState = rememberScrollState()

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 220.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Surface2)
            .verticalScroll(scrollState)
            .padding(16.dp),
    ) {
        Text(
            text = text.ifBlank { " " },
            color = Ink,
            style = TextStyle(
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
    method: String,
    path: String,
    body: String?,
): String = withContext(Dispatchers.IO) {
    val connection = (URL(apiBase + path).openConnection() as HttpURLConnection).apply {
        requestMethod = method
        connectTimeout = 5_000
        readTimeout = 5_000
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
