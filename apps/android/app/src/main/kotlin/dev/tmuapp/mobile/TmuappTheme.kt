package dev.tmuapp.mobile

import androidx.compose.ui.graphics.Color

data class TmuappPalette(
    val canvas: Color,
    val surface1: Color,
    val surface2: Color,
    val surface3: Color,
    val primary: Color,
    val success: Color,
    val warning: Color,
    val danger: Color,
    val ink: Color,
    val inkMuted: Color,
    val stroke: Color,
)

val DarkPalette = TmuappPalette(
    canvas = Color(0xFF07090D),
    surface1 = Color(0xFF10141B),
    surface2 = Color(0xFF171C24),
    surface3 = Color(0xFF202733),
    primary = Color(0xFF5E6AD2),
    success = Color(0xFF42C48C),
    warning = Color(0xFFE6B450),
    danger = Color(0xFFFF6B6B),
    ink = Color(0xFFF6F7FB),
    inkMuted = Color(0xFFA2AAB8),
    stroke = Color(0xFF2B3442),
)

val LightPalette = TmuappPalette(
    canvas = Color(0xFFF6F7FB),
    surface1 = Color(0xFFFFFFFF),
    surface2 = Color(0xFFEDEFF6),
    surface3 = Color(0xFFE1E5F0),
    primary = Color(0xFF4F5CC8),
    success = Color(0xFF1F9D68),
    warning = Color(0xFFA96800),
    danger = Color(0xFFD94343),
    ink = Color(0xFF131720),
    inkMuted = Color(0xFF667085),
    stroke = Color(0xFFD5DAE6),
)
