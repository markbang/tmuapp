package dev.tmuapp.mobile

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Typeface
import android.os.Bundle
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.launch
import kotlin.system.exitProcess

// ── Design tokens matching web ref + user spec ──
private val BgColor = Color(0xFF0F1117)
private val HeaderColor = Color(0xFF16191F)
private val CardColor = Color(0xFF050505)
private val CardHeaderColor = Color(0xFF1E222A)
private val BorderColor = Color(0xFF2D333F)
private val AccentColor = Color(0xFF4F46E5)       // indigo
private val GreenColor = Color(0xFF4ADE80)
private val TextPrimary = Color(0xFFCBD5E1)
private val TextMuted = Color(0xFF475569)
private val White = Color.White

private const val CrashPrefs = "tmuapp.crash"
private const val LastCrash = "lastCrash"
private const val AppPrefs = "tmuapp.android"
private const val PrefApiBase = "apiBase"
private const val PrefApiToken = "apiToken"

class MainActivity : ComponentActivity() {
    private val crashPrefs by lazy { getSharedPreferences(CrashPrefs, Context.MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        installCrashRecorder()
        super.onCreate(savedInstanceState)
        window.statusBarColor = android.graphics.Color.rgb(0x0F, 0x11, 0x17)
        window.navigationBarColor = android.graphics.Color.rgb(0x0F, 0x11, 0x17)

        val previousCrash = crashPrefs.getString(LastCrash, null)
        if (previousCrash != null) {
            showCrashFallback(previousCrash)
            return
        }

        try {
            setContent { TmuxApp(window, getSharedPreferences(AppPrefs, Context.MODE_PRIVATE)) }
        } catch (throwable: Throwable) {
            recordCrash(throwable)
            showCrashFallback(Log.getStackTraceString(throwable))
        }
    }

    private fun installCrashRecorder() {
        val previousHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            recordCrash(throwable)
            previousHandler?.uncaughtException(thread, throwable)
            exitProcess(2)
        }
    }

    private fun recordCrash(throwable: Throwable) {
        crashPrefs.edit().putString(LastCrash, Log.getStackTraceString(throwable)).commit()
    }

    private fun showCrashFallback(crash: String) {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 32, 32, 32)
            setBackgroundColor(android.graphics.Color.rgb(0x0F, 0x11, 0x17))
        }
        val title = TextView(this).apply {
            text = "tmuapp startup recovery"
            setTextColor(android.graphics.Color.rgb(247, 248, 248))
            textSize = 20f; typeface = Typeface.DEFAULT_BOLD
        }
        val body = TextView(this).apply {
            text = crash
            setTextColor(android.graphics.Color.rgb(247, 248, 248))
            textSize = 12f; typeface = Typeface.MONOSPACE
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
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        root.addView(clear)
        setContentView(root)
    }
}

@Composable
private fun TmuxApp(window: android.view.Window, prefs: android.content.SharedPreferences) {
    var apiBase by rememberSaveable { mutableStateOf(prefs.getString(PrefApiBase, "") ?: "") }
    var apiToken by rememberSaveable { mutableStateOf(prefs.getString(PrefApiToken, "") ?: "") }
    var configured by rememberSaveable { mutableStateOf(apiBase.trim().isNotBlank()) }
    var activeSessionId by rememberSaveable { mutableStateOf<String?>(null) }
    var snapshot by remember { mutableStateOf(TmuxSnapshot()) }
    var status by remember { mutableStateOf(AsyncStatus.Idle) }
    var notice by remember { mutableStateOf<String?>(null) }
    var operation by remember { mutableStateOf<Operation?>(null) }
    val scope = rememberCoroutineScope()

    SideEffect {
        window.statusBarColor = BgColor.toArgb()
        window.navigationBarColor = BgColor.toArgb()
    }

    val client = remember(apiBase, apiToken) {
        TmuappApiClient(apiBase.trim().trimEnd('/'), apiToken.trim().ifBlank { null })
    }

    fun persist() {
        prefs.edit()
            .putString(PrefApiBase, apiBase.trim().trimEnd('/'))
            .putString(PrefApiToken, apiToken.trim())
            .apply()
    }

    fun refresh() {
        status = AsyncStatus.Loading; operation = Operation.Refresh
        scope.launch {
            try {
                snapshot = client.snapshot()
                status = AsyncStatus.Ready
            } catch (e: Exception) {
                status = AsyncStatus.Error
                notice = e.message ?: "Connection failed"
            } finally { operation = null }
        }
    }

    fun connect() {
        persist(); status = AsyncStatus.Loading; operation = Operation.Connect
        scope.launch {
            try {
                client.health()
                snapshot = client.snapshot()
                configured = true; status = AsyncStatus.Ready
            } catch (e: Exception) {
                status = AsyncStatus.Error
                notice = e.message ?: "Connection failed"
            } finally { operation = null }
        }
    }

    fun createSession() {
        val name = "work-${System.currentTimeMillis() / 1000}"
        operation = Operation.Create
        scope.launch {
            try {
                val next = client.createSession(name, null)
                snapshot = next
                activeSessionId = next.sessions.find { it.name == name }?.id
            } catch (e: Exception) {
                notice = e.message ?: "Failed to create"
            } finally { operation = null }
        }
    }

    fun deleteSession(id: String) {
        operation = Operation.Delete
        scope.launch {
            try {
                snapshot = client.killSession(id)
                if (activeSessionId == id) activeSessionId = null
            } catch (e: Exception) {
                notice = e.message ?: "Failed to delete"
            } finally { operation = null }
        }
    }

    LaunchedEffect(configured) { if (configured) refresh() }

    BackHandler(enabled = activeSessionId != null && configured) {
        activeSessionId = null
    }

    Column(modifier = Modifier.fillMaxSize().background(BgColor).statusBarsPadding()) {
        if (!configured) {
            SetupScreen(
                apiBase = apiBase, apiToken = apiToken,
                busy = operation == Operation.Connect,
                notice = notice,
                onBaseChange = { apiBase = it },
                onTokenChange = { apiToken = it },
                onConnect = { connect() },
                onDismissNotice = { notice = null },
            )
            return@Column
        }

        AnimatedVisibility(visible = notice != null, enter = fadeIn(), exit = fadeOut()) {
            notice?.let { msg ->
                Row(
                    modifier = Modifier.fillMaxWidth().background(AccentColor.copy(alpha = 0.15f))
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                        .clickable { notice = null },
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    androidx.compose.material3.Text(msg, color = TextPrimary, fontSize = 13.sp)
                    androidx.compose.material3.Text("✕", color = TextMuted, fontSize = 13.sp)
                }
            }
        }

        if (activeSessionId != null) {
            TerminalScreen(
                sessionId = activeSessionId!!,
                client = client,
                onBack = { activeSessionId = null },
            )
        } else {
            Dashboard(
                sessions = snapshot.sessions,
                status = status,
                operation = operation,
                onRefresh = { refresh() },
                onCreate = { createSession() },
                onDelete = { deleteSession(it) },
                onSelect = { activeSessionId = it },
            )
        }
    }
}

// ── Setup screen ──
@Composable
private fun SetupScreen(
    apiBase: String, apiToken: String, busy: Boolean, notice: String?,
    onBaseChange: (String) -> Unit, onTokenChange: (String) -> Unit,
    onConnect: () -> Unit, onDismissNotice: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        androidx.compose.material3.Text(
            "TMUX PANEL", color = White, fontSize = 24.sp,
            fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Black,
            letterSpacing = 2.sp,
        )
        Spacer(Modifier.height(8.dp))
        androidx.compose.material3.Text(
            "Connect to your tmux API.", color = TextMuted, fontSize = 14.sp,
        )
        Spacer(Modifier.height(24.dp))

        notice?.let {
            Row(
                modifier = Modifier.fillMaxWidth().background(AccentColor.copy(alpha = 0.15f))
                    .padding(12.dp).clickable { onDismissNotice() },
            ) {
                androidx.compose.material3.Text(it, color = TextPrimary, fontSize = 13.sp)
            }
            Spacer(Modifier.height(12.dp))
        }

        FieldInput("API address", apiBase, onBaseChange, "http://10.0.2.2:8787")
        Spacer(Modifier.height(12.dp))
        FieldInput("API token", apiToken, onTokenChange, "Bearer token")
        Spacer(Modifier.height(16.dp))
        PrimaryButton("CONNECT", !busy && apiBase.trim().isNotBlank(), onClick = onConnect)
    }
}

// ── Dashboard ──
@Composable
private fun Dashboard(
    sessions: List<TmuxSession>,
    status: AsyncStatus,
    operation: Operation?,
    onRefresh: () -> Unit,
    onCreate: () -> Unit,
    onDelete: (String) -> Unit,
    onSelect: (String) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth().background(HeaderColor)
                .padding(horizontal = 16.dp, vertical = 12.dp)
                .border(1.dp, BorderColor, RoundedCornerShape(bottomStart = 8.dp, bottomEnd = 8.dp)),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier.size(10.dp).clip(CircleShape).background(GreenColor)
                )
                Spacer(Modifier.width(8.dp))
                androidx.compose.material3.Text(
                    "TMUX PANEL", color = White, fontSize = 16.sp,
                    fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Black,
                    letterSpacing = 1.sp,
                )
            }
            PrimaryButton(
                label = "NEW",
                enabled = operation != Operation.Create,
                onClick = onCreate,
                height = 32.dp,
                fontSize = 12.sp,
            )
        }

        // Content
        when {
            status == AsyncStatus.Loading -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    androidx.compose.material3.Text("Loading…", color = TextMuted)
                }
            }
            status == AsyncStatus.Error -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        androidx.compose.material3.Text("API offline", color = TextPrimary, fontSize = 18.sp)
                        Spacer(Modifier.height(8.dp))
                        PrimaryButton("RETRY", enabled = true, onClick = onRefresh)
                    }
                }
            }
            sessions.isEmpty() -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        androidx.compose.material3.Text("NO ACTIVE WINDOWS", color = TextMuted,
                            fontFamily = FontFamily.Monospace, fontSize = 14.sp, letterSpacing = 2.sp)
                        Spacer(Modifier.height(16.dp))
                        PrimaryButton("CREATE WINDOW", enabled = true, onClick = onCreate)
                    }
                }
            }
            else -> {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    contentPadding = PaddingValues(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    itemsIndexed(sessions, key = { _, s -> s.id }) { index, session ->
                        SessionCard(
                            index = index,
                            name = session.name,
                            attached = session.attached,
                            onClick = { onSelect(session.id) },
                            onDelete = { onDelete(session.id) },
                        )
                    }
                    item(key = "__create__") {
                        CreateCard(onClick = onCreate)
                    }
                }
            }
        }

        // Status bar
        if (sessions.isNotEmpty()) {
            Row(
                modifier = Modifier.fillMaxWidth().height(36.dp).background(CardHeaderColor)
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                sessions.forEachIndexed { index, session ->
                    androidx.compose.material3.Text(
                        "[$index] ${session.name}${if (session.attached) "*" else ""}",
                        color = if (session.attached) White else TextMuted,
                        fontFamily = FontFamily.Monospace, fontSize = 11.sp,
                        modifier = Modifier.padding(end = 16.dp).clickable { onSelect(session.id) },
                    )
                }
                Spacer(Modifier.weight(1f))
                androidx.compose.material3.Text(
                    "CTRL-B", color = AccentColor, fontFamily = FontFamily.Monospace,
                    fontSize = 9.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.background(BorderColor, RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun SessionCard(
    index: Int, name: String, attached: Boolean,
    onClick: () -> Unit, onDelete: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
            .background(CardColor).border(1.dp, BorderColor, RoundedCornerShape(8.dp))
            .clickable { onClick() },
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().background(CardHeaderColor)
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            androidx.compose.material3.Text(
                "$index: $name*", color = TextPrimary,
                fontFamily = FontFamily.Monospace, fontSize = 10.sp,
                maxLines = 1, modifier = Modifier.weight(1f),
            )
            if (attached) {
                Box(
                    Modifier.background(AccentColor, RoundedCornerShape(4.dp))
                        .padding(horizontal = 4.dp, vertical = 2.dp),
                ) {
                    androidx.compose.material3.Text(
                        "ACTIVE", color = White, fontSize = 8.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            } else {
                androidx.compose.material3.Text(
                    "✕", color = TextMuted, fontSize = 14.sp,
                    modifier = Modifier.clickable { onDelete() },
                )
            }
        }

        Spacer(Modifier.fillMaxWidth().height(1.dp).background(BorderColor))

        Column(
            modifier = Modifier.fillMaxWidth().height(140.dp).padding(12.dp),
        ) {
            androidx.compose.material3.Text(
                "root@prod:~$ ls -la", color = AccentColor,
                fontFamily = FontFamily.Monospace, fontSize = 10.sp,
            )
            androidx.compose.material3.Text(
                "total 24\ndrwxr-xr-x 2 root root\n-rw-r--r-- 1 root root",
                color = TextMuted, fontFamily = FontFamily.Monospace, fontSize = 10.sp,
            )
            Spacer(Modifier.weight(1f))
            androidx.compose.material3.Text("~", color = TextMuted, fontFamily = FontFamily.Monospace, fontSize = 10.sp)
            androidx.compose.material3.Text("~", color = TextMuted, fontFamily = FontFamily.Monospace, fontSize = 10.sp)
        }
    }
}

@Composable
private fun CreateCard(onClick: () -> Unit) {
    val stroke = Stroke(width = 2f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 10f), 0f))
    Box(
        modifier = Modifier.fillMaxWidth().height(175.dp).clip(RoundedCornerShape(8.dp))
            .clickable { onClick() }
            .drawBehind {
                drawRoundRect(color = BorderColor, style = stroke, cornerRadius = CornerRadius(8.dp.toPx()))
            },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                Modifier.size(40.dp).border(1.dp, TextMuted, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                androidx.compose.material3.Text("+", color = TextMuted, fontSize = 20.sp)
            }
            Spacer(Modifier.height(12.dp))
            androidx.compose.material3.Text(
                "CREATE WINDOW", color = TextMuted,
                fontFamily = FontFamily.Monospace, fontSize = 10.sp,
                letterSpacing = 1.sp, fontWeight = FontWeight.Bold,
            )
        }
    }
}

// ── Terminal screen ──
@Composable
private fun TerminalScreen(
    sessionId: String,
    client: TmuappApiClient,
    onBack: () -> Unit,
) {
    // Find the active pane for this session
    var snapshot by remember { mutableStateOf(TmuxSnapshot()) }
    var ansi by remember { mutableStateOf("") }
    var streamConn by remember { mutableStateOf<StreamConnection?>(null) }
    val scope = rememberCoroutineScope()

    // First fetch snapshot to find the first pane
    LaunchedEffect(sessionId) {
        try {
            val snap = client.snapshot()
            snapshot = snap
            val windows = snap.windows[sessionId].orEmpty()
            val activeWindow = windows.firstOrNull { it.active } ?: windows.firstOrNull()
            val panes = activeWindow?.let { snap.panes[it.id].orEmpty() }.orEmpty()
            val activePane = panes.firstOrNull { it.active } ?: panes.firstOrNull()
            if (activePane != null) {
                // Initial capture
                val capture = client.capturePane(activePane.id)
                ansi = capture.ansi
                // Open stream
                streamConn = client.connectStream(
                    paneId = activePane.id,
                    onOutput = { data -> ansi += data },
                    onError = { /* handled silently */ },
                    onClose = {
                        if (streamConn?.isOpen == false) streamConn = null
                    },
                )
            }
        } catch (_: Exception) {
            ansi = "Unable to connect to session."
        }
    }

    DisposableEffect(sessionId) {
        onDispose { streamConn?.close() }
    }

    Column(modifier = Modifier.fillMaxSize().background(BgColor)) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth().background(HeaderColor)
                .padding(horizontal = 16.dp, vertical = 12.dp)
                .border(1.dp, BorderColor, RoundedCornerShape(bottomStart = 8.dp, bottomEnd = 8.dp)),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PrimaryButton("← BACK", enabled = true, onClick = onBack, height = 32.dp, fontSize = 12.sp)
            Spacer(Modifier.width(16.dp))
            Box(Modifier.size(10.dp).clip(CircleShape).background(GreenColor))
            Spacer(Modifier.width(8.dp))
            androidx.compose.material3.Text(
                "TMUX TERMINAL", color = White, fontSize = 16.sp,
                fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Black,
                letterSpacing = 1.sp,
            )
            Spacer(Modifier.weight(1f))
            androidx.compose.material3.Text(
                sessionId, color = TextMuted, fontFamily = FontFamily.Monospace, fontSize = 11.sp,
            )
        }

        // Terminal WebView
        TerminalWebView(
            ansi = ansi,
            onInput = { data -> streamConn?.sendInput(data) },
            modifier = Modifier.fillMaxSize(),
        )
    }
}

// ── Reusable TerminalWebView ──
@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun TerminalWebView(
    ansi: String,
    onInput: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val jsBridge = remember { TerminalJsBridge(onInput) }
    var lastWritten by remember { mutableStateOf("") }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }

    val html = remember {
        val cdn = "https://cdn.jsdelivr.net/npm/@xterm/xterm@6"
        val fallbackCdn = "https://unpkg.com/@xterm/xterm@6"
        """<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<script>window.xtermCdn='$cdn';window.xtermFallbackCdn='$fallbackCdn';</script>
<script>
(function load(url){
  var s=document.createElement('script');
  s.src=url+'/lib/xterm.min.js';
  s.onerror=function(){ load(window.xtermFallbackCdn) };
  s.onload=function(){
    var link=document.createElement('link');
    link.rel='stylesheet';link.href=url+'/css/xterm.css';
    document.head.appendChild(link);
    initTerm()
  };
  document.head.appendChild(s);
})(window.xtermCdn);
function initTerm(){
  window.term=new Terminal({
    theme:{background:'#050505',foreground:'#cbd5e1',cursor:'#4f46e5',cursorAccent:'#050505',
      selectionBackground:'rgba(79,70,229,0.3)'},
    fontSize:13,fontFamily:'monospace',cursorBlink:true,scrollback:5000,
    allowProposedApi:true,drawBoldTextInBrightColors:true
  });
  window.term.open(document.getElementById('terminal'));
  window.term.onData(function(d){Android.onTerminalInput(d)});
  window.writeAnsi=function(d){window.term.write(d)};
  Android.onTerminalReady();
}
</script>
<style>body{margin:0;padding:0;background:#050505;overflow:hidden}.xterm{height:100vh;padding:6px 10px}.xterm-viewport{scroll-behavior:smooth}</style>
</head><body><div id="terminal"></div></body></html>"""
    }

    DisposableEffect(Unit) {
        onDispose {
            webViewRef?.onPause()
            webViewRef = null
        }
    }

    Box(modifier = modifier.background(CardColor)) {
        AndroidView(
            factory = { ctx ->
                WebView(ctx).apply {
                    val wv = this
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    setBackgroundColor(android.graphics.Color.rgb(5, 5, 5))
                    webViewClient = object : WebViewClient() {
                        override fun onReceivedError(view: WebView, code: Int, desc: String, failingUrl: String) {}
                    }
                    webChromeClient = WebChromeClient()
                    addJavascriptInterface(jsBridge.apply {
                        onReady = {
                            if (ansi.isNotEmpty()) {
                                wv.evaluateJavascript("writeAnsi(${toJsString(ansi)})", null)
                                lastWritten = ansi
                            }
                        }
                    }, "Android")
                    loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
                }.also { webViewRef = it }
            },
            update = { webView ->
                if (ansi.isNotEmpty() && ansi != lastWritten) {
                    webView.evaluateJavascript("try{writeAnsi(${toJsString(ansi)})}catch(e){}", null)
                    lastWritten = ansi
                }
            },
            modifier = Modifier.fillMaxSize(),
        )
    }
}

private fun toJsString(s: String): String {
    val escaped = s.replace("\\", "\\\\").replace("\"", "\\\"")
        .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t")
        .replace("\u001b", "\\x1b")
    return "\"$escaped\""
}

private class TerminalJsBridge(private val onInput: (String) -> Unit) {
    var onReady: (() -> Unit)? = null

    @JavascriptInterface
    fun onTerminalInput(data: String) { onInput(data) }

    @JavascriptInterface
    fun onTerminalReady() { onReady?.invoke() }
}

// ── Shared UI components ──
@Composable
private fun FieldInput(
    label: String, value: String, onValueChange: (String) -> Unit, placeholder: String,
) {
    Column {
        androidx.compose.material3.Text(label, color = TextMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(4.dp))
        Box(
            Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(8.dp))
                .background(BgColor).border(1.dp, BorderColor, RoundedCornerShape(8.dp))
                .padding(horizontal = 12.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            androidx.compose.material3.TextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                colors = androidx.compose.material3.TextFieldDefaults.colors(
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent,
                    focusedTextColor = TextPrimary,
                    unfocusedTextColor = TextPrimary,
                    cursorColor = AccentColor,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                ),
                placeholder = { androidx.compose.material3.Text(placeholder, color = TextMuted) },
            )
        }
    }
}

@Composable
private fun PrimaryButton(
    label: String, enabled: Boolean, onClick: () -> Unit,
    height: androidx.compose.ui.unit.Dp = 44.dp,
    fontSize: androidx.compose.ui.unit.TextUnit = 13.sp,
) {
    Box(
        modifier = Modifier.height(height).clip(RoundedCornerShape(6.dp))
            .background(if (enabled) AccentColor else AccentColor.copy(alpha = 0.4f))
            .clickable(enabled = enabled) { onClick() }
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.material3.Text(
            label, color = White, fontSize = fontSize,
            fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold,
        )
    }
}

private enum class AsyncStatus { Idle, Loading, Refreshing, Ready, Error }
private enum class Operation { Connect, Refresh, Create, Delete }
