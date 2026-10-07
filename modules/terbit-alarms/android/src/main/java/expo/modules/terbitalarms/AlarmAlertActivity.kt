package expo.modules.terbitalarms

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.text.DateFormat
import java.util.Date

/**
 * Native alarm screen shown over the lock screen. Deliberately plain and
 * native, so it works even before the React Native app loads. For saved
 * alarms with a mission, "Start mission" opens Terbit MY's mission screen;
 * "Stop alarm" is always available and is recorded as a stop.
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

    val saved = intent.getStringExtra(AlarmScheduler.EXTRA_KIND) == "saved"
    val missionRequired = intent.getBooleanExtra(AlarmScheduler.EXTRA_MISSION_REQUIRED, false)
    val challenge = intent.getStringExtra(AlarmScheduler.EXTRA_COMPLETION_MODE) == "challenge"

    fun button(label: String, onClick: () -> Unit) = Button(this).apply {
      text = label
      setOnClickListener {
        onClick()
        finish()
      }
    }

    val layout = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.rgb(28, 25, 23))
      setPadding(dp(32), dp(48), dp(32), dp(48))
      addView(text(DateFormat.getTimeInstance(DateFormat.SHORT).format(Date()), 56f, bold = true))
      addView(text(title, 22f, bold = true))
      if (!saved) {
        addView(text("Native alarm test (developer build)", 14f))
        addView(text("ID: " + (occurrenceId ?: alarmId), 12f))
      } else if (missionRequired) {
        addView(
          text(
            if (challenge) "Challenge: this morning stays incomplete until your mission is done." else "Your mission is ready in Terbit MY.",
            14f,
          ),
        )
      }

      if (saved && missionRequired) {
        // Leads into the mission. "Stop alarm" below always stays available.
        addView(button("Start mission") {
          AlarmReceiver.stop(this@AlarmAlertActivity, alarmId, fireAt, AlarmReceiver.ACTION_NAME_MISSION)
          openTerbit(alarmId, fireAt, startMission = true)
        })
        addView(button(if (challenge) "Stop alarm (mission not done)" else "Stop alarm") {
          AlarmReceiver.stop(this@AlarmAlertActivity, alarmId, fireAt, AlarmReceiver.ACTION_NAME_STOP)
        })
      } else {
        addView(button("Stop alarm") {
          AlarmReceiver.stop(this@AlarmAlertActivity, alarmId, fireAt, AlarmReceiver.ACTION_NAME_STOP)
        })
        addView(button("Stop and open Terbit MY") {
          AlarmReceiver.stop(this@AlarmAlertActivity, alarmId, fireAt, AlarmReceiver.ACTION_NAME_STOP)
          if (saved) openTerbit(alarmId, fireAt, startMission = false) else openLauncher()
        })
      }
    }
    setContentView(layout)
  }

  /** Opens Terbit MY on this alarm's morning: terbitmy://alarm-fired?alarmId=…&fireAt=…&start=1 */
  private fun openTerbit(alarmId: String, fireAt: Long, startMission: Boolean) {
    val uri = Uri.Builder()
      .scheme("terbitmy")
      .authority("alarm-fired")
      .appendQueryParameter("alarmId", alarmId)
      .appendQueryParameter("fireAt", fireAt.toString())
      .appendQueryParameter("start", if (startMission) "1" else "0")
      .build()
    val intent = Intent(Intent.ACTION_VIEW, uri).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      startActivity(intent)
    } catch (e: Exception) {
      openLauncher()
    }
  }

  private fun openLauncher() {
    packageManager.getLaunchIntentForPackage(packageName)?.let {
      startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }
}
