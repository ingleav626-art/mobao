package com.mobao.game;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends Activity {

    private static final String TAG = "MainActivity";
    private WebView webView;
    private NativeBridge nativeBridge;
    private boolean isGameRunning = false;
    private int lastKeyboardHeight = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow()
                    .getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        hideSystemUI();

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setDatabaseEnabled(true);

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.JELLY_BEAN_MR1) {
            settings.setMediaPlaybackRequiresUserGesture(false);
        }

        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        WebView.setWebContentsDebuggingEnabled(true);

        nativeBridge = new NativeBridge(this);
        webView.addJavascriptInterface(nativeBridge, "NativeBridge");

        webView.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface
            public int getKeyboardHeight() {
                return lastKeyboardHeight;
            }
        }, "AndroidKeyboard");

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                Log.d("WebView", consoleMessage.message() + " -- " + consoleMessage.sourceId() + ":"
                        + consoleMessage.lineNumber());
                return true;
            }

            @Override
            public Bitmap getDefaultVideoPoster() {
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
            }
        });

        setupKeyboardDetection();

        webView.loadUrl("file:///android_asset/index.html");
    }

    private void setupKeyboardDetection() {
        final View decorView = getWindow().getDecorView();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            decorView.setOnApplyWindowInsetsListener((v, windowInsets) -> {
                WindowInsets insets = v.getRootWindowInsets();
                if (insets != null) {
                    int imeHeight = insets.isVisible(WindowInsets.Type.ime())
                            ? insets.getInsets(WindowInsets.Type.ime()).bottom
                            : 0;

                    if (imeHeight != lastKeyboardHeight) {
                        lastKeyboardHeight = imeHeight;
                        Log.d(TAG, "Keyboard height changed: " + imeHeight);
                        notifyKeyboardHeightChanged(imeHeight);
                    }
                }
                return windowInsets;
            });
        } else {
            decorView.getViewTreeObserver().addOnGlobalLayoutListener(new ViewTreeObserver.OnGlobalLayoutListener() {
                @Override
                public void onGlobalLayout() {
                    Rect r = new Rect();
                    decorView.getWindowVisibleDisplayFrame(r);
                    int screenHeight = decorView.getRootView().getHeight();
                    int keyboardHeight = screenHeight - r.bottom;

                    if (keyboardHeight < 100) {
                        keyboardHeight = 0;
                    }

                    if (Math.abs(keyboardHeight - lastKeyboardHeight) > 50) {
                        lastKeyboardHeight = keyboardHeight;
                        Log.d(TAG, "Keyboard height changed (legacy): " + keyboardHeight);
                        notifyKeyboardHeightChanged(keyboardHeight);
                    }
                }
            });
        }

        Log.d(TAG, "Keyboard detection setup completed");
    }

    private void notifyKeyboardHeightChanged(int height) {
        if (webView != null) {
            String js = String.format(
                    "(function() { " +
                            "  var event = new CustomEvent('keyboardchange', { detail: { height: %d } }); " +
                            "  document.dispatchEvent(event); " +
                            "  if (window.__onKeyboardChange) { window.__onKeyboardChange(%d); } " +
                            "})();",
                    height, height);
            webView.evaluateJavascript(js, null);
        }
    }

    private void hideSystemUI() {
        View decorView = getWindow().getDecorView();
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(getWindow(), decorView);
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    void evaluateJs(String js) {
        if (webView != null) {
            webView.evaluateJavascript(js, null);
        }
    }

    void setGameRunning(boolean running) {
        isGameRunning = running;
        if (running) {
            startKeepService();
        } else {
            stopKeepService();
        }
    }

    private void startKeepService() {
        Intent intent = new Intent(this, GameKeepService.class);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
        Log.d(TAG, "GameKeepService started");
    }

    private void stopKeepService() {
        Intent intent = new Intent(this, GameKeepService.class);
        stopService(intent);
        Log.d(TAG, "GameKeepService stopped");
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUI();
        if (webView != null) {
            webView.evaluateJavascript(
                    "if(window.WarehouseScene&&WarehouseScene.instance&&WarehouseScene.instance.onLanForeground){WarehouseScene.instance.onLanForeground();}",
                    null);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.evaluateJavascript(
                    "if(window.WarehouseScene&&WarehouseScene.instance&&WarehouseScene.instance.onLanBackground){WarehouseScene.instance.onLanBackground();}",
                    null);
        }
    }

    @Override
    protected void onDestroy() {
        stopKeepService();
        if (nativeBridge != null) {
            nativeBridge.stopServer();
        }
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
