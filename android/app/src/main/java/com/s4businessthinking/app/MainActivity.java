package com.s4businessthinking.app;

import android.content.Intent;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onStart() {
        super.onStart();

        if (bridge == null || bridge.getWebView() == null) {
            return;
        }

        WebView webView = bridge.getWebView();
        webView.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null) {
                    return super.shouldOverrideUrlLoading(view, request);
                }

                String host = uri.getHost();
                if (host != null && shouldOpenExternally(host, uri.toString())) {
                    Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                    startActivity(intent);
                    return true;
                }

                return super.shouldOverrideUrlLoading(view, request);
            }
        });
    }

    private boolean shouldOpenExternally(String host, String url) {
        if (host.contains("github.com") || host.contains("githubusercontent.com")) {
            return true;
        }

        return url.matches("(?i).*\\.apk(\\?.*)?$");
    }
}
