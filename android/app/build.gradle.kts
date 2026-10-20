import java.util.Properties

plugins {
    id("com.android.application")
}

// Podpisový kľúč: lokálne z android/keystore.properties (nie je v gite), v CI z premenných prostredia.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

fun secret(prop: String, env: String): String? = keystoreProps.getProperty(prop) ?: System.getenv(env)

android {
    namespace = "io.github.jakugi.betterdpmb"
    compileSdk = 36

    defaultConfig {
        applicationId = "io.github.jakugi.betterdpmb"
        minSdk = 26
        targetSdk = 36
        // Google Play vyžaduje pri každom nahratí vyššie číslo verzie.
        versionCode = (System.getenv("VERSION_CODE") ?: "2").toInt()
        versionName = System.getenv("VERSION_NAME") ?: "1.1.0"
    }

    signingConfigs {
        create("release") {
            secret("storeFile", "ANDROID_KEYSTORE_FILE")?.let { storeFile = rootProject.file(it) }
            storePassword = secret("storePassword", "ANDROID_KEYSTORE_PASSWORD")
            keyAlias = secret("keyAlias", "ANDROID_KEY_ALIAS")
            keyPassword = secret("keyPassword", "ANDROID_KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

dependencies {
    // ComponentActivity, EdgeToEdge, OnBackPressedDispatcher, ActivityResult (povolenie polohy)
    implementation("androidx.activity:activity:1.13.0")
}
