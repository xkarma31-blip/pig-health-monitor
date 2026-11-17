package com.solrahk.pighealthmonitor.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.FileObserver
import android.view.View
import android.widget.RemoteViews
import com.solrahk.pighealthmonitor.R
import org.json.JSONObject
import java.io.File
import java.math.BigDecimal

/**
 * Native Android home-screen widget for PigPulse.
 *
 * This provider only *renders* the small, versioned JSON cache the app writes
 * into its internal files directory (`pigpulse_widget_state.json`). It is a
 * glanceable surface, not a clinical instrument, so it deliberately obeys the
 * same honesty rules as `src/utils/widget-state.ts`:
 *
 *   - it never turns a barn scene centre into a pig-temperature verdict;
 *   - it never appends a unit the contract did not carry;
 *   - it renders the supplied labels verbatim and invents none;
 *   - it recomputes freshness from the sample time on every render instead of
 *     trusting a possibly-stale `freshness` field in the file;
 *   - a missing file, a partly-written file or malformed JSON falls back to the
 *     last valid frame held in memory, and a first-ever failure renders an
 *     honest "unavailable" surface rather than crashing.
 *
 * Refresh paths supplement one another: the app-writable cache is watched with
 * a [FileObserver], the system still delivers periodic APPWIDGET_UPDATE
 * broadcasts, and a fresh cache re-renders every instance immediately. There is
 * no polling loop and nothing long-lived beyond the observer, which is released
 * in [onDisabled] and holds only the application context.
 */
class PigPulseWidgetProvider : AppWidgetProvider() {

    /** One validated contract-version-1 frame, reduced to what the widget draws. */
    private data class ParsedState(
        val theme: String,
        val deviceLabel: String,
        val statusLevel: String,
        val statusLabel: String,
        val readingKind: String,
        val readingValue: Double?,
        val readingLabel: String,
        val sampleAt: Long?,
        val alertMessage: String?
    )

    companion object {
        const val STATE_VERSION = 1
        const val STATE_FILE_NAME = "pigpulse_widget_state.json"
        const val FRESH_MS = 90_000L
        const val AGING_MS = 300_000L
        const val FUTURE_TOLERANCE_MS = 5_000L


        /** The last frame that passed validation, kept for the bad-data path. */
        @Volatile
        private var lastValidState: ParsedState? = null

        @Volatile
        private var stateObserver: FileObserver? = null
    }

    override fun onReceive(context: Context, intent: Intent) {
        try {
            super.onReceive(context, intent)
        } catch (_: Exception) {
            // A widget broadcast must never be able to crash the host process.
        }
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        try {
            ensureStateObserver(context)
            for (widgetId in appWidgetIds) {
                renderWidget(context, widgetId)
            }
        } catch (_: Exception) {
            // Never let a render failure propagate into the framework.
        }
    }

    override fun onEnabled(context: Context) {
        try {
            ensureStateObserver(context)
            renderAll(context)
        } catch (_: Exception) {
            // Ignore; the next broadcast or file event retries.
        }
    }

    override fun onDisabled(context: Context) {
        stopStateObserver()
    }

    /**
     * Watch the files directory so a freshly written cache updates every
     * instance immediately. The observer holds the application context only, so
     * it can never leak an Activity, and it is released in [onDisabled].
     */
    @Suppress("DEPRECATION")
    private fun ensureStateObserver(context: Context) {
        if (stateObserver != null) return

        val appContext = context.applicationContext
        val observer = object : FileObserver(
            appContext.filesDir.absolutePath,
            FileObserver.CLOSE_WRITE or FileObserver.MOVED_TO or FileObserver.DELETE
        ) {
            override fun onEvent(event: Int, path: String?) {
                // Only the exact cache file matters; it is briefly absent during
                // an overwrite-move, so react to the write/move/delete events.
                if (path != STATE_FILE_NAME) return
                try {
                    renderAll(appContext)
                } catch (_: Exception) {
                    // A render failure on the watcher thread must not kill it.
                }
            }
        }

        stateObserver = observer
        observer.startWatching()
    }

    private fun stopStateObserver() {
        stateObserver?.stopWatching()
        stateObserver = null
    }

    /** Re-render every instance of this provider. */
    private fun renderAll(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        val component = ComponentName(context, PigPulseWidgetProvider::class.java)
        for (widgetId in manager.getAppWidgetIds(component)) {
            renderWidget(context, widgetId)
        }
    }

    private fun renderWidget(context: Context, widgetId: Int) {
        val manager = AppWidgetManager.getInstance(context)
        val views = RemoteViews(context.packageName, R.layout.pigpulse_widget)
        val state = loadState(context)

        if (state == null) {
            renderUnavailable(context, views)
        } else {
            renderState(context, views, state)
        }

        attachOpenAppIntent(context, views)
        // Full hierarchy replacement - no partial update, no stale child left.
        manager.updateAppWidget(widgetId, views)
    }

    /**
     * Read the current cache. A missing file or malformed content falls back to
     * the last valid frame this process saw, so the widget never blanks out or
     * crashes on a partial write.
     */
    private fun loadState(context: Context): ParsedState? {
        val file = File(context.filesDir, STATE_FILE_NAME)
        if (!file.exists()) return lastValidState

        return try {
            val parsed = parseState(file.readText(Charsets.UTF_8))
            if (parsed != null) {
                lastValidState = parsed
                parsed
            } else {
                lastValidState
            }
        } catch (_: Exception) {
            lastValidState
        }
    }

    /**
     * Parse contract version 1. Anything that is not a v1 frame with a known
     * theme, status level and reading kind is rejected (returns null) so the
     * caller keeps the last good frame. No value is ever inferred or promoted.
     */
    private fun parseState(text: String): ParsedState? {
        return try {
            val root = JSONObject(text)

            val version = root.opt("v")
            if (version !is Number || version.toDouble() != STATE_VERSION.toDouble()) return null

            val theme = root.optString("theme")
            if (theme != "light" && theme != "dark") return null

            val status = root.optJSONObject("status") ?: return null
            val statusLevel = status.optString("level")
            if (
                statusLevel != "normal" &&
                statusLevel != "watch" &&
                statusLevel != "alert" &&
                statusLevel != "unknown"
            ) {
                return null
            }

            val reading = root.optJSONObject("reading") ?: return null
            val readingKind = reading.optString("kind")
            if (
                readingKind != "temperature" &&
                readingKind != "scene" &&
                readingKind != "ambient" &&
                readingKind != "none"
            ) {
                return null
            }

            val rawValue = reading.opt("value")
            val readingValue = if (rawValue is Number && rawValue.toDouble().isFinite()) {
                rawValue.toDouble()
            } else {
                null
            }

            val rawSampleAt = root.opt("sampleAt")
            val sampleAt = if (rawSampleAt is Number && rawSampleAt.toDouble().isFinite()) {
                rawSampleAt.toDouble().toLong()
            } else {
                null
            }

            val deviceId = root.optString("deviceId").trim()
            val deviceLabel = root.optString("deviceLabel").trim()
                .ifBlank { deviceId.ifBlank { "PigPulse box" } }

            val alert = root.optJSONObject("alert")
            val alertMessage = if (alert != null && alert.opt("current") == true) {
                alert.optString("message").trim().ifBlank { null }
            } else {
                null
            }

            ParsedState(
                theme = theme,
                deviceLabel = deviceLabel,
                statusLevel = statusLevel,
                statusLabel = status.optString("label").trim()
                    .ifBlank { "No reported device status" },
                readingKind = readingKind,
                readingValue = if (readingKind == "none") null else readingValue,
                readingLabel = reading.optString("label").trim().ifBlank { "No reading" },
                sampleAt = sampleAt,
                alertMessage = alertMessage
            )
        } catch (_: Exception) {
            null
        }
    }

    private fun renderState(context: Context, views: RemoteViews, state: ParsedState) {
        val dark = state.theme == "dark"
        applyTheme(context, views, dark)

        views.setTextViewText(R.id.widget_device, state.deviceLabel)

        views.setTextViewText(R.id.widget_status, state.statusLabel)
        views.setTextColor(R.id.widget_status, statusColor(context, state.statusLevel, dark))

        views.setTextViewText(R.id.widget_reading, readingText(state))
        views.setTextViewText(R.id.widget_reading_label, state.readingLabel)

        views.setTextViewText(
            R.id.widget_freshness,
            freshnessDescription(state.sampleAt, System.currentTimeMillis())
        )

        val message = state.alertMessage
        if (message == null) {
            views.setViewVisibility(R.id.widget_alert, View.GONE)
        } else {
            views.setViewVisibility(R.id.widget_alert, View.VISIBLE)
            views.setTextViewText(R.id.widget_alert, message)
        }
    }

    private fun renderUnavailable(context: Context, views: RemoteViews) {
        applyTheme(context, views, dark = false)

        views.setTextViewText(R.id.widget_device, "PigPulse box")
        views.setTextViewText(R.id.widget_status, "Waiting for PigPulse data")
        views.setTextColor(
            R.id.widget_status,
            context.getColor(R.color.widget_status_unknown)
        )
        views.setTextViewText(R.id.widget_reading, "—")
        views.setTextViewText(R.id.widget_reading_label, "No reading")
        views.setTextViewText(R.id.widget_freshness, "Open the app to refresh")
        views.setViewVisibility(R.id.widget_alert, View.GONE)
    }

    private fun applyTheme(context: Context, views: RemoteViews, dark: Boolean) {
        val background = if (dark) {
            R.drawable.widget_background_dark
        } else {
            R.drawable.widget_background_light
        }
        val primary = context.getColor(
            if (dark) R.color.widget_primary_text_dark else R.color.widget_primary_text_light
        )
        val secondary = context.getColor(
            if (dark) R.color.widget_secondary_text_dark else R.color.widget_secondary_text_light
        )
        val logo = if (dark) R.drawable.logo_dark else R.drawable.logo_light

        views.setImageViewResource(R.id.widget_logo, logo)
        views.setInt(R.id.widget_root, "setBackgroundResource", background)
        views.setTextColor(R.id.widget_device, secondary)
        views.setTextColor(R.id.widget_reading, primary)
        views.setTextColor(R.id.widget_reading_label, secondary)
        views.setTextColor(R.id.widget_freshness, secondary)
        views.setTextColor(R.id.widget_alert, context.getColor(if (dark) R.color.widget_status_alert_dark else R.color.widget_status_alert))
    }

    private fun statusColor(context: Context, level: String, dark: Boolean): Int {
        val resource = when (level) {
            "normal" -> {
                if (dark) R.color.widget_status_normal_dark else R.color.widget_status_normal
            }
            "watch" -> {
                if (dark) R.color.widget_status_watch_dark else R.color.widget_status_watch
            }
            "alert" -> {
                if (dark) R.color.widget_status_alert_dark else R.color.widget_status_alert
            }
            else -> {
                if (dark) R.color.widget_status_unknown_dark else R.color.widget_status_unknown
            }
        }
        return context.getColor(resource)
    }

    /**
     * Exact display of the reported reading. No unit and no rounding are added:
     * a scene centre stays a scene centre, shown just as the contract carries it.
     */
    private fun readingText(state: ParsedState): String {
        val value = state.readingValue
        if (state.readingKind == "none" || value == null) return "—"
        return BigDecimal.valueOf(value).stripTrailingZeros().toPlainString()
    }

    /**
     * Recompute the freshness band from the sample time on every render, so the
     * widget cannot show a stale "fresh" label after the declared update period.
     * The JSON `freshness` field is deliberately ignored.
     */
    private fun recomputeFreshness(sampleAt: Long?, now: Long): String {
        if (sampleAt == null) return "unknown"
        val age = now - sampleAt
        if (age < -FUTURE_TOLERANCE_MS) return "unknown"
        if (age <= FRESH_MS) return "fresh"
        if (age <= AGING_MS) return "aging"
        return "stale"
    }

    private fun freshnessDescription(sampleAt: Long?, now: Long): String {
        if (sampleAt == null) return "Update time unknown"

        val age = now - sampleAt
        return when (recomputeFreshness(sampleAt, now)) {
            "fresh" -> "Updated just now"
            "aging" -> {
                val minutes = ((age + 59_999L) / 60_000L).coerceAtLeast(1L)
                "Updated $minutes min ago"
            }
            "stale" -> "Data may be stale"
            else -> "Update time uncertain"
        }
    }

    /** Tapping anywhere on the widget opens the app. */
    private fun attachOpenAppIntent(context: Context, views: RemoteViews) {
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: return
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val pending = PendingIntent.getActivity(context, 0, launchIntent, flags)
        views.setOnClickPendingIntent(R.id.widget_root, pending)
    }
}
