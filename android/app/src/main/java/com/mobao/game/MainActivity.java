package com.mobao.game;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {

    private static final String TAG = "MainActivity";
    private WebView webView;
    private NativeBridge nativeBridge;
    private boolean isGameRunning = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);

        View decorView = getWindow().getDecorView();
        int uiOptions = View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
        decorView.setSystemUiVisibility(uiOptions);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setDatabaseEnabled(true);

        WebView.setWebContentsDebuggingEnabled(true);

        nativeBridge = new NativeBridge(this);
        webView.addJavascriptInterface(nativeBridge, "NativeBridge");

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                Log.d("WebView", consoleMessage.message() + " -- " + consoleMessage.sourceId() + ":"
                        + consoleMessage.lineNumber());
                return true;
            }
        });

        webView.loadUrl("file:///android_asset/index.html");
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
        View decorView = getWindow().getDecorView();
        decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
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
