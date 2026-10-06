package expo.modules.terbitalarms

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.text.DateFormat
import java.util.Date

/**
 * Proof-of-concept alarm screen shown over the lock screen. Deliberately
 * plain and native, so it works even before the React Native app loads.
 * The full Terbit MY ringing screen + mission comes in a later milestone.
 */
class AlarmAlertActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    render(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    render(intent)
  }

  private fun render(intent: Intent) {
    val alarmId = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID) ?: run { finish(); return }
    val occurrenceId = intent.getStringExtra(AlarmScheduler.EXTRA_OCCURRENCE_ID)
    val fireAt = intent.getLongExtra(AlarmScheduler.EXTRA_FIRE_AT, 0L)
    val title = intent.getStringExtra(AlarmScheduler.EXTRA_TITLE) ?: "Terbit MY alarm"
    val density = resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()

    fun text(value: String, size: Float, bold: Boolean = false) = TextView(this).apply {
      this.text = value
      textSize = size
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      if (bold) typeface = Typeface.DEFAULT_BOLD
      setPadding(0, dp(6), 0, dp(6))
    }

    val layout = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.rgb(28, 25, 23))
      setPadding(dp(32), dp(48), dp(32), dp(48))
      addView(text(DateFormat.getTimeInstance(DateFormat.SHORT).format(Date()), 56f, bold = true))
      addView(text(title, 22f, bold = true))
      addView(text("Native alarm test (developer build)", 14f))
      addView(text("ID: " + (occurrenceId ?: alarmId), 12f))
      addView(Button(this@AlarmAlertActivity).apply {
        text = "Stop alarm"
        setOnClickListener {
          AlarmReceiver.stop(this@AlarmAlertActivity, alarmId, fireAt)
          finish()
        }
      })
      addView(Button(this@AlarmAlertActivity).apply {
        text = "Stop and open Terbit MY"
        setOnClickListener {
          AlarmReceiver.stop(this@AlarmAlertActivity, alarmId, fireAt)
          packageManager.getLaunchIntentForPackage(packageName)?.let {
            startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
          }
          finish()
        }
      })
    }
    setContentView(layout)
  }
}
