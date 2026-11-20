package com.knowknowledgeacademy.resourcesfinder;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Know Knowledge Academy - Resources Finder
 * Full-screen app that shows the live website. Links to other websites
 * (job ads, scholarship pages, PDFs) open in the phone's browser.
 */
public class MainActivity extends Activity {

    private static final String HOME = "https://kka-resources-finder.pages.dev/";
    private static final String HOST = "kka-resources-finder.pages.dev";

    private WebView web;
    private ProgressBar bar;
    private LinearLayout offline;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#070B17"));

        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        FrameLayout.LayoutParams barLp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, dp(4));
        barLp.gravity = Gravity.TOP;
        root.addView(bar, barLp);

        offline = buildOfflineView();
        offline.setVisibility(View.GONE);
        root.addView(offline, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);      // profile + tracker are saved in localStorage
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportMultipleWindows(false); // target=_blank links come through shouldOverrideUrlLoading
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " KKAFinderApp/1.0");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(Uri.parse(url));
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                bar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                bar.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    offline.setVisibility(View.VISIBLE);
                }
            }

            @SuppressWarnings("deprecation")
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                offline.setVisibility(View.VISIBLE);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                bar.setProgress(newProgress);
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(HOME);
        }
    }

    /** Stay inside the app for our own site; open everything else in the phone's browser/apps. */
    private boolean handleUrl(Uri uri) {
        String scheme = uri.getScheme();
        if (("https".equals(scheme) || "http".equals(scheme)) && HOST.equalsIgnoreCase(uri.getHost())) {
            return false;
        }
        openExternal(uri);
        return true;
    }

    private void openExternal(Uri uri) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, uri);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            Toast.makeText(this, "No app found to open this link", Toast.LENGTH_SHORT).show();
        }
    }

    private LinearLayout buildOfflineView() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(Color.parseColor("#070B17"));
        box.setPadding(dp(32), dp(32), dp(32), dp(32));
        box.setClickable(true);

        TextView icon = new TextView(this);
        icon.setText("📡");
        icon.setTextSize(48);
        icon.setGravity(Gravity.CENTER);
        box.addView(icon);

        TextView title = new TextView(this);
        title.setText("No internet connection");
        title.setTextColor(Color.WHITE);
        title.setTextSize(20);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(12), 0, dp(6));
        box.addView(title);

        TextView msg = new TextView(this);
        msg.setText("Connect to Wi-Fi or mobile data, then try again.");
        msg.setTextColor(Color.parseColor("#97A1BD"));
        msg.setTextSize(14);
        msg.setGravity(Gravity.CENTER);
        msg.setPadding(0, 0, 0, dp(20));
        box.addView(msg);

        Button retry = new Button(this);
        retry.setText("Try again");
        retry.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                offline.setVisibility(View.GONE);
                String current = web.getUrl();
                if (current == null || current.startsWith("data:") || current.equals("about:blank")) {
                    web.loadUrl(HOME);
                } else {
                    web.reload();
                }
            }
        });
        box.addView(retry);
        return box;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    @Override
    public void onBackPressed() {
        if (offline.getVisibility() == View.VISIBLE) {
            offline.setVisibility(View.GONE);
        }
        if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }
}
