package com.s4businessthinking.app;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Android WebView ignores window.print(); this hands the bill HTML to the system print
// dialog, which lists Wi-Fi/Bluetooth printers from installed print services and "Save as PDF".
@CapacitorPlugin(name = "S4Print")
public class S4PrintPlugin extends Plugin {
    // Must stay referenced until the print job has been laid out.
    private WebView printView;

    @PluginMethod
    public void printHtml(PluginCall call) {
        final String html = call.getString("html", "");
        final String name = call.getString("name", "S4 Document");
        getActivity().runOnUiThread(() -> {
            WebView view = new WebView(getContext());
            view.getSettings().setJavaScriptEnabled(false);
            view.setWebViewClient(new WebViewClient() {
                private boolean started = false;

                @Override
                public void onPageFinished(WebView v, String url) {
                    if (started) return;
                    started = true;
                    try {
                        PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                        pm.print(name, v.createPrintDocumentAdapter(name), new PrintAttributes.Builder().build());
                        call.resolve();
                    } catch (Exception e) {
                        call.reject(e.getMessage());
                    }
                }
            });
            view.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
            printView = view;
        });
    }
}
