package com.gesetze.app

import android.content.pm.ActivityInfo
import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Portrait-Sperre mit Tablet-Ausnahme ab 600dp: android:screenOrientation="portrait"
    // im AndroidManifest.xml ist der statische Handy-Default. Auf Tablets (sw600dp,
    // siehe res/values-sw600dp/bools.xml) wird das hier zur Laufzeit auf volle
    // Rotation umgestellt.
    requestedOrientation = if (resources.getBoolean(R.bool.ist_tablet)) {
      ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
    } else {
      ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    }
  }
}