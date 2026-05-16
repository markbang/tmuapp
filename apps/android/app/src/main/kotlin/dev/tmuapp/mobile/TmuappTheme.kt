package dev.tmuapp.mobile

import androidx.compose.ui.graphics.Color

/**
 * Design tokens unified with web `tokens.css` as the single source of truth.
 * The web app defines the semantic colour system; Android mirrors it exactly.
 */
data class TmuappPalette(
    val canvas: Color,
    val surface1: Color,
    val surface2: Color,
    val surface3: Color,
    val surface4: Color,
    val primary: Color,
    val primaryHover: Color,
    val primaryBg: Color,
    val success: Color,
    val successBg: Color,
    val warning: Color,
    val warningBg: Color,
    val danger: Color,
    val dangerBg: Color,
    val ink: Color,
    val inkMuted: Color,
    val inkSubtle: Color,
    val hairline: Color,
    val hairlineStrong: Color,
    val terminalBg: Color,
    val previewBg: Color,
)

// Matches tokens.css :root exactly
val DarkPalette = TmuappPalette(
    canvas = Color(0xFF010102),
    surface1 = Color(0xFF0F1011),
    surface2 = Color(0xFF141516),
    surface3 = Color(0xFF18191A),
    surface4 = Color(0xFF191A1B),
    primary = Color(0xFF5E6AD2),
    primaryHover = Color(0xFF828FFF),
    primaryBg = Color(0x295E6AD2), // rgba(94,106,210,0.16)
    success = Color(0xFF27A644),
    successBg = Color(0x2E27A644), // rgba(39,166,68,0.18)
    warning = Color(0xFFD99A2B),
    warningBg = Color(0x29D99A2B), // rgba(217,154,43,0.16)
    danger = Color(0xFFFF6B6B),
    dangerBg = Color(0x1FFF6B6B), // rgba(255,107,107,0.12)
    ink = Color(0xFFF7F8F8),
    inkMuted = Color(0xFFD0D6E0),
    inkSubtle = Color(0xFFA1A7B0),
    hairline = Color(0xFF23252A),
    hairlineStrong = Color(0xFF34343A),
    terminalBg = Color(0xFF010102),
    previewBg = Color(0xFF050506),
)

val LightPalette = TmuappPalette(
    canvas = Color(0xFFF6F7FB),
    surface1 = Color(0xFFFFFFFF),
    surface2 = Color(0xFFEDEFF6),
    surface3 = Color(0xFFE1E5F0),
    surface4 = Color(0xFFD9DDE8),
    primary = Color(0xFF4F5CC8),
    primaryHover = Color(0xFF6B78E0),
    primaryBg = Color(0x1A4F5CC8),
    success = Color(0xFF1F9D68),
    successBg = Color(0x1A1F9D68),
    warning = Color(0xFFA96800),
    warningBg = Color(0x1AA96800),
    danger = Color(0xFFD94343),
    dangerBg = Color(0x1AD94343),
    ink = Color(0xFF131720),
    inkMuted = Color(0xFF667085),
    inkSubtle = Color(0xFF8F96A0),
    hairline = Color(0xFFD5DAE6),
    hairlineStrong = Color(0xFFC0C5D4),
    terminalBg = Color(0xFFF6F7FB),
    previewBg = Color(0xFFE8EBF2),
)
