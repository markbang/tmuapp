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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.launch
import kotlin.system.exitProcess

private const val CrashPrefs = "tmuapp.crash"
private const val LastCrash = "lastCrash"
private const val AppPrefs = "tmuapp.android"
private const val PrefApiBase = "apiBase"
private const val PrefApiToken = "apiToken"
private const val PrefDarkMode = "darkMode"

class MainActivity : ComponentActivity() {
    private val crashPrefs by lazy { getSharedPreferences(CrashPrefs, Context.MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        installCrashRecorder()
        super.onCreate(savedInstanceState)
        window.statusBarColor = android.graphics.Color.rgb(7, 9, 13)
        window.navigationBarColor = android.graphics.Color.rgb(7, 9, 13)

        val previousCrash = crashPrefs.getString(LastCrash, null)
        if (previousCrash != null) {
            showCrashFallback(previousCrash)
            return
        }

        try {
            setContent { TmuappClient(window, getSharedPreferences(AppPrefs, Context.MODE_PRIVATE)) }
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
            setBackgroundColor(android.graphics.Color.rgb(7, 9, 13))
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
private fun TmuappClient(window: android.view.Window, prefs: android.content.SharedPreferences) {
    var apiBase by rememberSaveable { mutableStateOf(prefs.getString(PrefApiBase, "") ?: "") }
    var apiToken by rememberSaveable { mutableStateOf(prefs.getString(PrefApiToken, "") ?: "") }
    var darkMode by rememberSaveable { mutableStateOf(prefs.getBoolean(PrefDarkMode, true)) }
    var configured by rememberSaveable { mutableStateOf(apiBase.trim().isNotBlank()) }
    var view by rememberSaveable { mutableStateOf(AppView.Overview) }
    var snapshot by remember { mutableStateOf(TmuxSnapshot()) }
    var selectedSession by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedWindow by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedPane by rememberSaveable { mutableStateOf<String?>(null) }
    var capture by remember { mutableStateOf("Select a session to open a pane preview.") }
    // Buffer for WebSocket streaming — accumulates output so WebView
    // always receives the full terminal state.
    var captureBuffer by remember { mutableStateOf("") }
    var status by remember { mutableStateOf(AsyncStatus.Idle) }
    var notice by remember { mutableStateOf<Notice?>(null) }
    var operation by remember { mutableStateOf<Operation?>(null) }
    var newSessionName by rememberSaveable { mutableStateOf("work") }
    var newSessionCwd by rememberSaveable { mutableStateOf("") }
    var showComposer by rememberSaveable { mutableStateOf(false) }
    var paneInput by rememberSaveable { mutableStateOf("") }
    var streamConn by remember { mutableStateOf<StreamConnection?>(null) }
    var showShortcuts by rememberSaveable { mutableStateOf(false) }
    val sessionPreviews = remember { mutableStateMapOf<String, String>() }
    val palette = if (darkMode) DarkPalette else LightPalette
    val scope = rememberCoroutineScope()

    SideEffect {
        window.statusBarColor = palette.canvas.toArgb()
        window.navigationBarColor = palette.canvas.toArgb()
    }

    val client = remember(apiBase, apiToken) {
        TmuappApiClient(apiBase.trim().trimEnd('/'), apiToken.trim().ifBlank { null })
    }

    fun persistSettings() {
        prefs.edit()
            .putString(PrefApiBase, apiBase.trim().trimEnd('/'))
            .putString(PrefApiToken, apiToken.trim())
            .putBoolean(PrefDarkMode, darkMode)
            .apply()
    }

    fun applySnapshot(next: TmuxSnapshot, preferredSession: String? = selectedSession) {
        snapshot = next
        val session = preferredSession?.takeIf { id -> next.sessions.any { it.id == id } }
            ?: next.sessions.firstOrNull()?.id
        val window = session?.let { sessionId ->
            selectedWindow?.takeIf { id -> next.windows[sessionId].orEmpty().any { it.id == id } }
                ?: next.windows[sessionId].orEmpty().firstOrNull { it.active }?.id
                ?: next.windows[sessionId].orEmpty().firstOrNull()?.id
        }
        val pane = window?.let { windowId ->
            selectedPane?.takeIf { id -> next.panes[windowId].orEmpty().any { it.id == id } }
                ?: next.panes[windowId].orEmpty().firstOrNull { it.active }?.id
                ?: next.panes[windowId].orEmpty().firstOrNull()?.id
        }
        selectedSession = session
        selectedWindow = window
        selectedPane = pane
    }

    fun refresh(showLoading: Boolean = true) {
        if (showLoading) status = AsyncStatus.Loading else status = AsyncStatus.Refreshing
        operation = Operation.Refresh
        scope.launch {
            try {
                applySnapshot(client.snapshot())
                status = AsyncStatus.Ready
                notice = Notice(NoticeTone.Success, "Sessions updated")
            } catch (exception: Exception) {
                status = AsyncStatus.Error
                notice = Notice(NoticeTone.Danger, "Unable to reach API", exception.readableMessage())
            } finally {
                operation = null
            }
        }
    }

    fun openSession(sessionId: String) {
        applySnapshot(snapshot, sessionId)
        view = AppView.Manage
    }

    fun refreshCapture(paneId: String? = selectedPane) {
        if (paneId.isNullOrBlank()) {
            capture = "No pane selected."
            return
        }
        operation = Operation.Capture
        scope.launch {
            try {
                val next = client.capturePane(paneId)
                capture = next.ansi.ifBlank { "Pane $paneId is empty." }
                captureBuffer = next.ansi
            } catch (exception: Exception) {
                capture = "Unable to capture $paneId\n${exception.readableMessage()}"
                notice = Notice(NoticeTone.Danger, "Pane capture failed", exception.readableMessage())
            } finally {
                operation = null
            }
        }
    }

    fun createSession() {
        val name = newSessionName.trim()
        if (name.isBlank()) {
            notice = Notice(NoticeTone.Warning, "Session name is required")
            return
        }
        operation = Operation.Create
        scope.launch {
            try {
                val next = client.createSession(name, newSessionCwd)
                applySnapshot(next, next.sessions.find { it.name == name }?.id)
                showComposer = false
                view = AppView.Manage
                notice = Notice(NoticeTone.Success, "Session created", name)
            } catch (exception: Exception) {
                notice = Notice(NoticeTone.Danger, "Unable to create session", exception.readableMessage())
            } finally {
                operation = null
            }
        }
    }

    fun splitPane(direction: String) {
        val pane = selectedPane ?: return
        operation = Operation.Split
        scope.launch {
            try {
                applySnapshot(client.splitPane(pane, direction))
                notice = Notice(NoticeTone.Success, "Pane split", direction)
                refreshCapture()
            } catch (exception: Exception) {
                notice = Notice(NoticeTone.Danger, "Unable to split pane", exception.readableMessage())
            } finally {
                operation = null
            }
        }
    }

    fun sendPaneInput(sendEnter: Boolean) {
        val pane = selectedPane ?: return
        val command = paneInput
        val conn = streamConn

        if (conn?.isOpen == true) {
            // Send via WebSocket (live stream)
            if (command.isNotBlank()) {
                conn.sendInput(command)
                conn.sendInput("\r")
                paneInput = ""
            } else if (sendEnter) {
                conn.sendInput("\r")
            }
            return
        }

        // Fallback: HTTP
        if (!sendEnter && command.isBlank()) return
        operation = Operation.Input
        scope.launch {
            try {
                if (sendEnter) {
                    client.sendEnter(pane)
                } else {
                    client.sendInput(pane, command)
                    client.sendEnter(pane)
                    paneInput = ""
                }
                notice = Notice(NoticeTone.Success, "Input sent", pane)
            } catch (exception: Exception) {
                notice = Notice(NoticeTone.Danger, "Unable to send input", exception.readableMessage())
            } finally {
                operation = null
            }
        }
    }

    fun killCurrentWindow() {
        val window = selectedWindow ?: return
        operation = Operation.Delete
        scope.launch {
            try {
                applySnapshot(client.killWindow(window))
                notice = Notice(NoticeTone.Success, "Window closed")
                if (selectedPane != null) refreshCapture()
            } catch (exception: Exception) {
                notice = Notice(NoticeTone.Danger, "Unable to close window", exception.readableMessage())
            } finally {
                operation = null
            }
        }
    }

    fun connectInitial() {
        persistSettings()
        operation = Operation.Connect
        status = AsyncStatus.Loading
        scope.launch {
            try {
                client.health()
                applySnapshot(client.snapshot())
                configured = true
                status = AsyncStatus.Ready
                notice = Notice(NoticeTone.Success, "Connected", apiBase.trim())
            } catch (exception: Exception) {
                status = AsyncStatus.Error
                notice = Notice(NoticeTone.Danger, "Connection failed", exception.readableMessage())
            } finally {
                operation = null
            }
        }
    }

    LaunchedEffect(configured) {
        if (configured) {
            refresh(showLoading = true)
        }
    }

    LaunchedEffect(view, selectedPane) {
        // Close previous stream
        streamConn?.close()
        streamConn = null
        captureBuffer = ""

        val pane = selectedPane
        if (view == AppView.Manage && pane != null) {
            // Initial HTTP capture for instant feedback
            scope.launch {
                try {
                    val next = client.capturePane(pane)
                    capture = next.ansi.ifBlank { " " }
                    captureBuffer = next.ansi
                } catch (_: Exception) {
                    capture = "Connecting…"
                }
            }
            // Open WebSocket stream for live output
            streamConn = client.connectStream(
                paneId = pane,
                onOutput = { data ->
                    captureBuffer += data
                    capture = captureBuffer
                },
                onError = { msg ->
                    notice = Notice(NoticeTone.Danger, "Stream error", msg)
                },
                onClose = {
                    if (streamConn?.isOpen == false) streamConn = null
                },
            )
        }
    }

    // Fetch session previews for overview cards
    LaunchedEffect(view, snapshot) {
        if (view != AppView.Overview) return@LaunchedEffect
        snapshot.sessions.forEach { session ->
            if (session.id in sessionPreviews) return@forEach
            val window = snapshot.windows[session.id].orEmpty().firstOrNull { it.active }
                ?: snapshot.windows[session.id].orEmpty().firstOrNull()
            val pane = window?.let { w ->
                snapshot.panes[w.id].orEmpty().firstOrNull { it.active }
                    ?: snapshot.panes[w.id].orEmpty().firstOrNull()
            }
            if (pane != null) {
                scope.launch {
                    try {
                        val pc = client.capturePane(pane.id, 8)
                        val text = pc.ansi.take(300)
                        sessionPreviews[session.id] = text.ifBlank { pane.title.ifBlank { pane.currentCommand } }
                    } catch (_: Exception) {
                        sessionPreviews[session.id] = pane.title.ifBlank { pane.currentCommand.ifBlank { pane.id } }
                    }
                }
            }
        }
    }

    BackHandler(enabled = view != AppView.Overview && configured) {
        streamConn?.close()
        streamConn = null
        view = AppView.Overview
    }

    AppShell(palette = palette) {
        if (!configured) {
            SetupScreen(
                apiBase = apiBase,
                apiToken = apiToken,
                busy = operation == Operation.Connect,
                notice = notice,
                palette = palette,
                onBaseChange = { apiBase = it },
                onTokenChange = { apiToken = it },
                onConnect = { connectInitial() },
            )
            return@AppShell
        }

        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            TopBar(
                view = view,
                status = status,
                operation = operation,
                palette = palette,
                onBack = { view = AppView.Overview },
                onRefresh = { refresh(showLoading = false) },
                onSettings = { view = AppView.Settings },
                onNewSession = {
                    showComposer = true
                    view = AppView.Overview
                },
                onShowShortcuts = { showShortcuts = true },
            )
            notice?.let { NoticeBanner(it, palette) { notice = null } }

            if (showShortcuts) {
                ShortcutSheet(palette) { showShortcuts = false }
            }

            when (view) {
                AppView.Overview -> OverviewScreen(
                    snapshot = snapshot,
                    status = status,
                    operation = operation,
                    showComposer = showComposer || snapshot.sessions.isEmpty(),
                    newSessionName = newSessionName,
                    newSessionCwd = newSessionCwd,
                    sessionPreviews = sessionPreviews,
                    palette = palette,
                    onSessionNameChange = { newSessionName = it },
                    onSessionCwdChange = { newSessionCwd = it },
                    onCreateSession = { createSession() },
                    onCancelComposer = { showComposer = false },
                    onOpenSession = { openSession(it) },
                    onRetry = { refresh(showLoading = true) },
                )
                AppView.Manage -> ManageScreen(
                    snapshot = snapshot,
                    selectedSession = selectedSession,
                    selectedWindow = selectedWindow,
                    selectedPane = selectedPane,
                    capture = capture,
                    paneInput = paneInput,
                    operation = operation,
                    palette = palette,
                    onWindowSelect = { windowId ->
                        selectedWindow = windowId
                        selectedPane = snapshot.panes[windowId].orEmpty().firstOrNull { it.active }?.id
                            ?: snapshot.panes[windowId].orEmpty().firstOrNull()?.id
                    },
                    onPaneSelect = { selectedPane = it },
                    onPaneInputChange = { paneInput = it },
                    onSendInput = { sendPaneInput(sendEnter = false) },
                    onSendEnter = { sendPaneInput(sendEnter = true) },
                    onRefreshPane = { refreshCapture() },
                    onSplitHorizontal = { splitPane("horizontal") },
                    onSplitVertical = { splitPane("vertical") },
                    onKillWindow = { killCurrentWindow() },
                    onTerminalInput = { data -> streamConn?.sendInput(data) },
                )
                AppView.Settings -> SettingsScreen(
                    apiBase = apiBase,
                    apiToken = apiToken,
                    darkMode = darkMode,
                    palette = palette,
                    onBaseChange = { apiBase = it },
                    onTokenChange = { apiToken = it },
                    onDarkModeChange = {
                        darkMode = it
                        prefs.edit().putBoolean(PrefDarkMode, it).apply()
                    },
                    onSave = {
                        persistSettings()
                        notice = Notice(NoticeTone.Success, "Settings saved")
                        refresh(showLoading = true)
                        view = AppView.Overview
                    },
                    onReset = {
                        prefs.edit().clear().apply()
                        apiBase = ""
                        apiToken = ""
                        configured = false
                        snapshot = TmuxSnapshot()
                        notice = null
                    },
                )
            }
        }
    }
}

@Composable
private fun AppShell(palette: TmuappPalette, content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.canvas)
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp, vertical = 18.dp),
    ) {
        content()
    }
}

@Composable
private fun SetupScreen(
    apiBase: String,
    apiToken: String,
    busy: Boolean,
    notice: Notice?,
    palette: TmuappPalette,
    onBaseChange: (String) -> Unit,
    onTokenChange: (String) -> Unit,
    onConnect: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Spacer(Modifier.height(16.dp))
        SectionHeader(
            title = "tmuapp",
            subtitle = "Connect Android to your tmux API.",
            palette = palette,
        )
        notice?.let { NoticeBanner(it, palette) {} }
        SurfaceCard(palette = palette) {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                ClientField("API address", apiBase, onBaseChange, palette, KeyboardType.Uri, "http://10.0.2.2:8787")
                ClientField("API token", apiToken, onTokenChange, palette, KeyboardType.Password, "Bearer token")
                PrimaryButton(
                    label = if (busy) "Connecting..." else "Connect",
                    enabled = !busy && apiBase.trim().isNotBlank(),
                    palette = palette,
                    onClick = onConnect,
                )
            }
        }
    }
}

@Composable
private fun TopBar(
    view: AppView,
    status: AsyncStatus,
    operation: Operation?,
    palette: TmuappPalette,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onSettings: () -> Unit,
    onNewSession: () -> Unit,
    onShowShortcuts: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (view != AppView.Overview) {
                    IconButton("<", palette, onBack)
                }
                Column {
                    BasicText(
                        text = when (view) {
                            AppView.Overview -> "tmuapp"
                            AppView.Manage -> "Cockpit"
                            AppView.Settings -> "Settings"
                        },
                        style = TextStyle(color = palette.ink, fontSize = 24.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold),
                    )
                    BasicText(
                        text = when (view) {
                            AppView.Overview -> "Fleet cards for live tmux sessions"
                            AppView.Manage -> "Pane controls and terminal capture"
                            AppView.Settings -> "App preferences and API access"
                        },
                        style = TextStyle(color = palette.inkMuted, fontSize = 13.sp, lineHeight = 18.sp),
                    )
                }
            }
            StatusPill(statusLabel(status, operation), statusTone(status), palette)
            if (view == AppView.Manage) {
                SecondaryButton("?", enabled = true, palette = palette, onClick = onShowShortcuts)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            SecondaryButton("Refresh", enabled = operation != Operation.Refresh, palette = palette, modifier = Modifier.weight(1f), onClick = onRefresh)
            SecondaryButton("Settings", enabled = true, palette = palette, modifier = Modifier.weight(1f), onClick = onSettings)
            PrimaryButton("New", enabled = operation != Operation.Create, palette = palette, modifier = Modifier.weight(1f), onClick = onNewSession)
        }
    }
}

@Composable
private fun OverviewScreen(
    snapshot: TmuxSnapshot,
    status: AsyncStatus,
    operation: Operation?,
    showComposer: Boolean,
    newSessionName: String,
    newSessionCwd: String,
    sessionPreviews: Map<String, String>,
    palette: TmuappPalette,
    onSessionNameChange: (String) -> Unit,
    onSessionCwdChange: (String) -> Unit,
    onCreateSession: () -> Unit,
    onCancelComposer: () -> Unit,
    onOpenSession: (String) -> Unit,
    onRetry: () -> Unit,
) {
    val totalWindows = snapshot.sessions.sumOf { snapshot.windows[it.id].orEmpty().size }
    val totalPanes = snapshot.sessions.sumOf { session ->
        snapshot.windows[session.id].orEmpty().sumOf { window -> snapshot.panes[window.id].orEmpty().size }
    }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SummaryBand(snapshot.sessions.size, totalWindows, totalPanes, palette)
        if (showComposer) {
            SessionComposer(
                name = newSessionName,
                cwd = newSessionCwd,
                busy = operation == Operation.Create,
                showCancel = snapshot.sessions.isNotEmpty(),
                palette = palette,
                onNameChange = onSessionNameChange,
                onCwdChange = onSessionCwdChange,
                onSubmit = onCreateSession,
                onCancel = onCancelComposer,
            )
        }
        when {
            status == AsyncStatus.Loading -> InlineState("Loading tmux sessions...", palette)
            status == AsyncStatus.Error -> EmptyState("tmux API is offline", "Retry when the API is available.", "Retry", palette, onRetry)
            snapshot.sessions.isEmpty() -> EmptyState("No tmux sessions", "Create a session to start managing panes.", null, palette, null)
            else -> SessionGrid(snapshot, sessionPreviews, palette, onOpenSession)
        }
    }
}

@Composable
private fun ManageScreen(
    snapshot: TmuxSnapshot,
    selectedSession: String?,
    selectedWindow: String?,
    selectedPane: String?,
    capture: String,
    paneInput: String,
    operation: Operation?,
    palette: TmuappPalette,
    onWindowSelect: (String) -> Unit,
    onPaneSelect: (String) -> Unit,
    onPaneInputChange: (String) -> Unit,
    onSendInput: () -> Unit,
    onSendEnter: () -> Unit,
    onRefreshPane: () -> Unit,
    onSplitHorizontal: () -> Unit,
    onSplitVertical: () -> Unit,
    onKillWindow: () -> Unit,
    onTerminalInput: (String) -> Unit,
) {
    val session = snapshot.sessions.find { it.id == selectedSession }
    val windows = selectedSession?.let { snapshot.windows[it].orEmpty() }.orEmpty()
    val panes = selectedWindow?.let { snapshot.panes[it].orEmpty() }.orEmpty()
    val pane = panes.find { it.id == selectedPane }

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SurfaceCard(palette = palette) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                BasicText(
                    text = session?.name ?: "No session selected",
                    style = TextStyle(color = palette.ink, fontSize = 20.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold),
                )
                BasicText(
                    text = pane?.let { "${it.width}x${it.height} ${it.currentPath}" } ?: "Choose a window and pane to continue.",
                    style = TextStyle(color = palette.inkMuted, fontSize = 13.sp, lineHeight = 18.sp),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        SelectorStrip("Windows", windows, selectedWindow, palette, onWindowSelect) { window ->
            "${window.index}:${window.name.ifBlank { "window" }} (${window.panes})"
        }
        if (panes.size > 1) {
            SelectorStrip("Panes", panes, selectedPane, palette, onPaneSelect) { nextPane ->
                nextPane.title.ifBlank { nextPane.currentCommand.ifBlank { nextPane.id } }
            }
        }
        TerminalWebView(
            ansi = if (capture.startsWith("Select a session") || capture.startsWith("No pane")) "" else capture,
            palette = palette,
            onInput = onTerminalInput,
            onLoadingChange = { /* managed in TerminalJsBridge */ },
            onError = { /* managed in TerminalJsBridge */ },
        )
        SurfaceCard(palette = palette) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                ClientField("Send command", paneInput, onPaneInputChange, palette, KeyboardType.Text, "pwd")
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    PrimaryButton("Run", enabled = selectedPane != null && paneInput.isNotBlank() && operation != Operation.Input, palette = palette, modifier = Modifier.weight(1f), onClick = onSendInput)
                    SecondaryButton("Enter", enabled = selectedPane != null && operation != Operation.Input, palette = palette, modifier = Modifier.weight(1f), onClick = onSendEnter)
                    SecondaryButton("Capture", enabled = selectedPane != null && operation != Operation.Capture, palette = palette, modifier = Modifier.weight(1f), onClick = onRefreshPane)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    SecondaryButton("Split H", enabled = selectedPane != null && operation != Operation.Split, palette = palette, modifier = Modifier.weight(1f), onClick = onSplitHorizontal)
                    SecondaryButton("Split V", enabled = selectedPane != null && operation != Operation.Split, palette = palette, modifier = Modifier.weight(1f), onClick = onSplitVertical)
                    DangerButton("Kill Window", enabled = selectedWindow != null && operation != Operation.Delete, palette = palette, modifier = Modifier.weight(1f), onClick = onKillWindow)
                }
            }
        }
    }
}

@Composable
private fun SettingsScreen(
    apiBase: String,
    apiToken: String,
    darkMode: Boolean,
    palette: TmuappPalette,
    onBaseChange: (String) -> Unit,
    onTokenChange: (String) -> Unit,
    onDarkModeChange: (Boolean) -> Unit,
    onSave: () -> Unit,
    onReset: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SurfaceCard(palette = palette) {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                SectionHeader("App settings", "Address, token, and display mode.", palette)
                ClientField("API address", apiBase, onBaseChange, palette, KeyboardType.Uri, "http://host:8787")
                ClientField("API token", apiToken, onTokenChange, palette, KeyboardType.Password, "Bearer token")
                ToggleRow("Dark mode", darkMode, palette, onDarkModeChange)
                PrimaryButton("Save settings", enabled = apiBase.trim().isNotBlank(), palette = palette, onClick = onSave)
            }
        }
        DangerButton("Clear setup", enabled = true, palette = palette, onClick = onReset)
    }
}

@Composable
private fun SummaryBand(sessions: Int, windows: Int, panes: Int, palette: TmuappPalette) {
    SurfaceCard(palette = palette) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            Metric("Sessions", sessions.toString(), palette, Modifier.weight(1f))
            Metric("Windows", windows.toString(), palette, Modifier.weight(1f))
            Metric("Panes", panes.toString(), palette, Modifier.weight(1f))
        }
    }
}

@Composable
private fun Metric(label: String, value: String, palette: TmuappPalette, modifier: Modifier = Modifier) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        BasicText(text = value, style = TextStyle(color = palette.ink, fontSize = 22.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold))
        BasicText(text = label, style = TextStyle(color = palette.inkMuted, fontSize = 12.sp, lineHeight = 16.sp))
    }
}

@Composable
private fun SessionComposer(
    name: String,
    cwd: String,
    busy: Boolean,
    showCancel: Boolean,
    palette: TmuappPalette,
    onNameChange: (String) -> Unit,
    onCwdChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onCancel: () -> Unit,
) {
    SurfaceCard(palette = palette) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionHeader("New tmux session", "Create and open a managed session.", palette)
            ClientField("Session name", name, onNameChange, palette, KeyboardType.Text, "work")
            ClientField("Working directory", cwd, onCwdChange, palette, KeyboardType.Text, "/repo")
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                if (showCancel) {
                    SecondaryButton("Cancel", true, palette, Modifier.weight(1f), onCancel)
                }
                PrimaryButton(if (busy) "Creating..." else "Create", !busy && name.trim().isNotBlank(), palette, Modifier.weight(1f), onSubmit)
            }
        }
    }
}

@Composable
private fun SessionGrid(snapshot: TmuxSnapshot, sessionPreviews: Map<String, String>, palette: TmuappPalette, onOpen: (String) -> Unit) {
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val columns = if (maxWidth >= 560.dp) 2 else 1
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            snapshot.sessions.chunked(columns).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    row.forEach { session ->
                        SessionCard(session, snapshot, sessionPreviews[session.id], palette, Modifier.weight(1f)) { onOpen(session.id) }
                    }
                    repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

@Composable
private fun SessionCard(
    session: TmuxSession,
    snapshot: TmuxSnapshot,
    preview: String?,
    palette: TmuappPalette,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val windows = snapshot.windows[session.id].orEmpty()
    val panes = windows.flatMap { snapshot.panes[it.id].orEmpty() }
    val primaryPane = panes.firstOrNull { it.active } ?: panes.firstOrNull()
    SurfaceCard(
        palette = palette,
        modifier = modifier.clickable(onClick = onClick),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                BasicText(
                    text = session.name,
                    style = TextStyle(color = palette.ink, fontSize = 18.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                StatusPill(if (session.attached) "attached" else "detached", if (session.attached) NoticeTone.Success else NoticeTone.Warning, palette)
            }
            BasicText(
                text = "${windows.size} windows / ${panes.size} panes / ${primaryPane?.currentCommand?.ifBlank { "idle" } ?: "idle"}",
                style = TextStyle(color = palette.inkMuted, fontSize = 12.sp, lineHeight = 16.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            BasicText(
                text = primaryPane?.currentPath?.ifBlank { "No working directory" } ?: "No panes",
                style = TextStyle(color = palette.inkMuted, fontSize = 12.sp, lineHeight = 16.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 74.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(palette.previewBg)
                    .border(1.dp, palette.hairline, RoundedCornerShape(8.dp))
                    .padding(10.dp),
            ) {
                BasicText(
                    text = preview?.ifBlank { null }
                        ?: primaryPane?.let { it.title.ifBlank { it.currentCommand.ifBlank { it.id } } }
                        ?: "Loading preview…",
                    style = TextStyle(color = if (preview != null) palette.ink else palette.inkSubtle, fontFamily = FontFamily.Monospace, fontSize = 12.sp, lineHeight = 16.sp),
                    maxLines = 6,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun <T> SelectorStrip(
    label: String,
    items: List<T>,
    selectedId: String?,
    palette: TmuappPalette,
    onSelect: (String) -> Unit,
    itemLabel: (T) -> String,
) where T : Any {
    if (items.isEmpty()) {
        InlineState("No ${label.lowercase()} available.", palette)
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        BasicText(text = label, style = TextStyle(color = palette.inkMuted, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.SemiBold))
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
        ) {
            items.forEach { item ->
                val id = when (item) {
                    is TmuxWindow -> item.id
                    is TmuxPane -> item.id
                    else -> item.toString()
                }
                val selected = id == selectedId
                Box(
                    modifier = Modifier
                        .width(132.dp)
                        .height(42.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (selected) palette.primary else palette.surface1)
                        .border(1.dp, if (selected) palette.primary else palette.hairline, RoundedCornerShape(8.dp))
                        .clickable { onSelect(id) }
                        .padding(horizontal = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    BasicText(
                        text = itemLabel(item),
                        style = TextStyle(color = if (selected) Color.White else palette.ink, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.SemiBold),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun TerminalWebView(
    ansi: String,
    palette: TmuappPalette,
    onInput: (String) -> Unit,
    onLoadingChange: (Boolean) -> Unit = {},
    onError: (String?) -> Unit = {},
) {
    val jsBridge = remember { TerminalJsBridge(onInput) }
    var lastWritten by remember { mutableStateOf("") }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }

    // Build HTML with CDN primary + fallback
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
    var w=new Worker(URL.createObjectURL(new Blob([
      'importScripts("'+url+'/lib/xterm-addon-webgl.min.js")'
    ],{type:'text/javascript'})));
    w.onerror=function(){}; // WebGL optional
    var link=document.createElement('link');
    link.rel='stylesheet';link.href=url+'/css/xterm.css';
    document.head.appendChild(link);
    initTerm()
  };
  document.head.appendChild(s);
})(window.xtermCdn);
function initTerm(){
  window.term=new Terminal({
    theme:{background:'#010102',foreground:'#f7f8f8',cursor:'#5e6ad2',cursorAccent:'#010102'},
    fontSize:13,fontFamily:'monospace',cursorBlink:true,scrollback:2000,allowProposedApi:true
  });
  window.term.open(document.getElementById('terminal'));
  window.term.onData(function(d){Android.onTerminalInput(d)});
  window.term.onKey(function(e){
    if(e.key.length>0){var c=e.key.charCodeAt(0);if(c<32||c===127)Android.onTerminalInput(e.key)}
  });
  window.writeAnsi=function(d){window.term.write(d)};
  Android.onTerminalReady();
}
</script>
<style>body{margin:0;padding:0;background:#010102;overflow:hidden}.xterm{height:100vh;padding:6px 10px}.xterm-viewport{scroll-behavior:smooth}</style>
</head><body><div id="terminal"></div></body></html>"""
    }

    // Lifecycle: pause/resume WebView timers
    DisposableEffect(Unit) {
        onDispose {
            webViewRef?.onPause()
            webViewRef = null
        }
    }

    SurfaceCard(palette = palette) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                BasicText(
                    text = "Terminal",
                    style = TextStyle(color = palette.ink, fontSize = 16.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold),
                )
            }
            Box(modifier = Modifier.fillMaxWidth().heightIn(min = 280.dp)) {
                AndroidView(
                    factory = { ctx ->
                        WebView(ctx).apply {
                            val wv = this
                            settings.javaScriptEnabled = true
                            settings.domStorageEnabled = true
                            setBackgroundColor(palette.terminalBg.toArgb())
                            webViewClient = object : WebViewClient() {
                                override fun onPageFinished(view: WebView, url: String) {
                                    view.evaluateJavascript("document.body.style.backgroundColor='${palette.terminalBg.toHex()}'", null)
                                }
                                override fun onReceivedError(view: WebView, code: Int, desc: String, failingUrl: String) {
                                    onError("Terminal failed to load")
                                    onLoadingChange(false)
                                }
                            }
                            webChromeClient = WebChromeClient()
                            addJavascriptInterface(jsBridge.apply {
                                onReady = {
                                    onLoadingChange(false)
                                    onError(null)
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
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 280.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .border(1.dp, palette.hairline, RoundedCornerShape(8.dp)),
                )
            }
        }
    }
}

private fun Color.toHex(): String {
    val r = (this.red * 255).toInt()
    val g = (this.green * 255).toInt()
    val b = (this.blue * 255).toInt()
    return "#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}"
}

private fun toJsString(s: String): String {
    val escaped = s
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
        .replace("\u001b", "\\x1b")
    return "\"$escaped\""
}

private class TerminalJsBridge(
    private val onInput: (String) -> Unit,
) {
    var onReady: (() -> Unit)? = null

    @JavascriptInterface
    fun onTerminalInput(data: String) {
        onInput(data)
    }

    @JavascriptInterface
    fun onTerminalReady() {
        onReady?.invoke()
    }
}

@Composable
private fun ClientField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    palette: TmuappPalette,
    keyboardType: KeyboardType = KeyboardType.Text,
    placeholder: String = "",
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        BasicText(text = label, style = TextStyle(color = palette.inkMuted, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.SemiBold))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(46.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(palette.canvas)
                .border(1.dp, palette.hairline, RoundedCornerShape(8.dp))
                .padding(horizontal = 12.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (value.isBlank() && placeholder.isNotBlank()) {
                BasicText(text = placeholder, style = TextStyle(color = palette.inkMuted, fontSize = 14.sp, lineHeight = 20.sp))
            }
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                textStyle = TextStyle(color = palette.ink, fontSize = 14.sp, lineHeight = 20.sp),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, keyboardType = keyboardType),
            )
        }
    }
}

@Composable
private fun SurfaceCard(
    palette: TmuappPalette,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(palette.surface1)
            .border(1.dp, palette.hairline, RoundedCornerShape(8.dp))
            .padding(14.dp),
    ) {
        content()
    }
}

@Composable
private fun SectionHeader(title: String, subtitle: String, palette: TmuappPalette) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        BasicText(text = title, style = TextStyle(color = palette.ink, fontSize = 18.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold))
        BasicText(text = subtitle, style = TextStyle(color = palette.inkMuted, fontSize = 13.sp, lineHeight = 18.sp))
    }
}

@Composable
private fun NoticeBanner(notice: Notice, palette: TmuappPalette, onDismiss: () -> Unit) {
    val toneColor = toneColor(notice.tone, palette)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(palette.surface2)
            .border(1.dp, toneColor, RoundedCornerShape(8.dp))
            .clickable(onClick = onDismiss)
            .padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(Modifier.size(9.dp).clip(CircleShape).background(toneColor))
        Column(verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.weight(1f)) {
            BasicText(text = notice.title, style = TextStyle(color = palette.ink, fontSize = 13.sp, lineHeight = 17.sp, fontWeight = FontWeight.SemiBold))
            notice.body?.let { BasicText(text = it, style = TextStyle(color = palette.inkMuted, fontSize = 12.sp, lineHeight = 16.sp)) }
        }
    }
}

@Composable
private fun StatusPill(label: String, tone: NoticeTone, palette: TmuappPalette) {
    val color = toneColor(tone, palette)
    Box(
        modifier = Modifier
            .height(28.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(color.copy(alpha = 0.14f))
            .border(1.dp, color.copy(alpha = 0.55f), RoundedCornerShape(8.dp))
            .padding(horizontal = 9.dp),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(text = label, style = TextStyle(color = color, fontSize = 11.sp, lineHeight = 14.sp, fontWeight = FontWeight.SemiBold))
    }
}

@Composable
private fun InlineState(label: String, palette: TmuappPalette) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(palette.surface1)
            .border(1.dp, palette.hairline, RoundedCornerShape(8.dp))
            .padding(16.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        BasicText(text = label, style = TextStyle(color = palette.inkMuted, fontSize = 13.sp, lineHeight = 18.sp))
    }
}

@Composable
private fun EmptyState(
    title: String,
    body: String,
    actionLabel: String?,
    palette: TmuappPalette,
    onAction: (() -> Unit)?,
) {
    SurfaceCard(palette = palette) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionHeader(title, body, palette)
            if (actionLabel != null && onAction != null) {
                SecondaryButton(actionLabel, true, palette, onClick = onAction)
            }
        }
    }
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, palette: TmuappPalette, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicText(text = label, style = TextStyle(color = palette.ink, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold))
        Box(
            modifier = Modifier
                .width(54.dp)
                .height(30.dp)
                .clip(RoundedCornerShape(15.dp))
                .background(if (checked) palette.primary else palette.surface3)
                .clickable { onChange(!checked) }
                .padding(3.dp),
            contentAlignment = if (checked) Alignment.CenterEnd else Alignment.CenterStart,
        ) {
            Box(Modifier.size(24.dp).clip(CircleShape).background(Color.White))
        }
    }
}

@Composable
private fun PrimaryButton(
    label: String,
    enabled: Boolean,
    palette: TmuappPalette,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    AppButton(label, enabled, palette.primary, if (enabled) Color.White else palette.inkMuted, modifier, onClick)
}

@Composable
private fun SecondaryButton(
    label: String,
    enabled: Boolean,
    palette: TmuappPalette,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    AppButton(label, enabled, palette.surface2, if (enabled) palette.ink else palette.inkMuted, modifier, onClick, palette.hairline)
}

@Composable
private fun DangerButton(
    label: String,
    enabled: Boolean,
    palette: TmuappPalette,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    AppButton(label, enabled, palette.danger.copy(alpha = if (enabled) 0.16f else 0.08f), if (enabled) palette.danger else palette.inkMuted, modifier, onClick, palette.danger.copy(alpha = 0.45f))
}

@Composable
private fun IconButton(label: String, palette: TmuappPalette, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(palette.surface1)
            .border(1.dp, palette.hairline, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(text = label, style = TextStyle(color = palette.ink, fontSize = 24.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold))
    }
}

@Composable
private fun AppButton(
    label: String,
    enabled: Boolean,
    background: Color,
    content: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
    stroke: Color = Color.Transparent,
) {
    Box(
        modifier = modifier
            .height(44.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (enabled) background else background.copy(alpha = 0.55f))
            .border(1.dp, stroke, RoundedCornerShape(8.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(
            text = label,
            style = TextStyle(color = content, fontSize = 13.sp, lineHeight = 17.sp, fontWeight = FontWeight.SemiBold),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun ShortcutSheet(palette: TmuappPalette, onDismiss: () -> Unit) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        SurfaceCard(palette = palette) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    SectionHeader("Keyboard Shortcuts", "Terminal-native controls", palette)
                    SecondaryButton("Close", enabled = true, palette = palette, onClick = onDismiss)
                }
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    ShortcutRow("Window 1-9", "Alt + 1…9", palette)
                    ShortcutRow("Prev/Next Window", "Alt + ← →", palette)
                    ShortcutRow("Prev/Next Pane", "Ctrl+Alt + ← →", palette)
                    ShortcutRow("Focus Input", "Ctrl + L", palette)
                    ShortcutRow("Search Terminal", "Ctrl+Shift + F", palette)
                    ShortcutRow("Font Size ±", "Cmd/Ctrl + = / -", palette)
                    ShortcutRow("Reset Font", "Cmd/Ctrl + 0", palette)
                }
                BasicText(
                    text = "All keyboard input in the terminal is forwarded to tmux. Control keys (Ctrl+C, arrows, Tab, Escape) work exactly as in a native terminal.",
                    style = TextStyle(color = palette.inkMuted, fontSize = 11.sp, lineHeight = 15.sp),
                )
            }
        }
    }
}

@Composable
private fun ShortcutRow(action: String, keys: String, palette: TmuappPalette) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicText(text = action, style = TextStyle(color = palette.ink, fontSize = 13.sp, lineHeight = 18.sp))
        BasicText(
            text = keys,
            style = TextStyle(
                color = palette.primary,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                fontWeight = FontWeight.SemiBold
            ),
        )
    }
}

private enum class AppView { Overview, Manage, Settings }
private enum class AsyncStatus { Idle, Loading, Refreshing, Ready, Error }
private enum class Operation { Connect, Refresh, Create, Capture, Split, Input, Delete }
private enum class NoticeTone { Success, Warning, Danger, Neutral }

private data class Notice(
    val tone: NoticeTone,
    val title: String,
    val body: String? = null,
)

private fun statusLabel(status: AsyncStatus, operation: Operation?): String = when {
    operation != null -> operation.name.lowercase()
    status == AsyncStatus.Ready -> "online"
    status == AsyncStatus.Error -> "offline"
    status == AsyncStatus.Loading -> "loading"
    status == AsyncStatus.Refreshing -> "refreshing"
    else -> "idle"
}

private fun statusTone(status: AsyncStatus): NoticeTone = when (status) {
    AsyncStatus.Ready -> NoticeTone.Success
    AsyncStatus.Error -> NoticeTone.Danger
    AsyncStatus.Loading, AsyncStatus.Refreshing -> NoticeTone.Neutral
    AsyncStatus.Idle -> NoticeTone.Warning
}

private fun toneColor(tone: NoticeTone, palette: TmuappPalette): Color = when (tone) {
    NoticeTone.Success -> palette.success
    NoticeTone.Warning -> palette.warning
    NoticeTone.Danger -> palette.danger
    NoticeTone.Neutral -> palette.primary
}

private fun Exception.readableMessage(): String = message ?: javaClass.simpleName
