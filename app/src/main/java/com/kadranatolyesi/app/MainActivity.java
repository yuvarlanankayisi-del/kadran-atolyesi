package com.kadranatolyesi.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
  static final int PICK_IMAGE = 7;
  WebView web;
  ValueCallback<Uri[]> fileCallback;
  File lastFile;

  @Override protected void onCreate(Bundle b) {
    super.onCreate(b);
    boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    web = new WebView(this);
    web.setBackgroundColor(Color.parseColor(night ? "#11151c" : "#e9ecf1"));
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setAllowFileAccess(true);
    s.setAllowContentAccess(true);
    web.addJavascriptInterface(new Bridge(), "KadranApp");
    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
        Uri u = r.getUrl();
        if ("file".equals(u.getScheme())) return false;
        try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { }
        return true;
      }
    });
    web.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        fileCallback = cb;
        Intent i = new Intent(Intent.ACTION_GET_CONTENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("image/*");
        try {
          startActivityForResult(Intent.createChooser(i, "Resim seç"), PICK_IMAGE);
        } catch (ActivityNotFoundException e) {
          fileCallback = null;
          return false;
        }
        return true;
      }
    });
    setContentView(web);
    web.loadUrl("file:///android_asset/index.html");
  }

  @Override protected void onActivityResult(int req, int res, Intent data) {
    super.onActivityResult(req, res, data);
    if (req == PICK_IMAGE && fileCallback != null) {
      fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
      fileCallback = null;
    }
  }

  @Override public void onBackPressed() {
    if (web.canGoBack()) web.goBack(); else super.onBackPressed();
  }

  // Dosyayi once paylasim icin uygulama onbellegine, sonra Indirilenler/Kadran klasorune yazar
  String saveFile(String name, byte[] data) throws Exception {
    File dir = new File(getCacheDir(), "kadran");
    dir.mkdirs();
    File[] old = dir.listFiles();
    if (old != null) for (File f : old) f.delete();
    lastFile = new File(dir, name);
    try (FileOutputStream o = new FileOutputStream(lastFile)) { o.write(data); }
    if (Build.VERSION.SDK_INT >= 29) {
      ContentValues cv = new ContentValues();
      cv.put(MediaStore.Downloads.DISPLAY_NAME, name);
      cv.put(MediaStore.Downloads.MIME_TYPE, "application/octet-stream");
      cv.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Kadran");
      Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
      if (u == null) return "";
      try (OutputStream os = getContentResolver().openOutputStream(u)) { os.write(data); }
      return "İndirilenler/Kadran";
    }
    File d = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
    if (d == null) return "";
    d.mkdirs();
    try (FileOutputStream o = new FileOutputStream(new File(d, name))) { o.write(data); }
    return d.getAbsolutePath();
  }

  // Son dosyayi "birlikte ac" listesiyle acar; Gadgetbridge listede cikar
  void openLast() {
    if (lastFile == null || !lastFile.exists()) { Toast.makeText(this, "Önce saat yüzünü oluştur.", Toast.LENGTH_SHORT).show(); return; }
    Uri u = FileProvider.getUriForFile(this, "com.kadranatolyesi.app.files", lastFile);
    Intent view = new Intent(Intent.ACTION_VIEW);
    view.setDataAndType(u, "application/octet-stream");
    view.setClipData(ClipData.newRawUri("", u));
    view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    try {
      startActivity(Intent.createChooser(view, "Gadgetbridge ile aç"));
      return;
    } catch (Exception e) { }
    Intent send = new Intent(Intent.ACTION_SEND);
    send.setType("application/octet-stream");
    send.putExtra(Intent.EXTRA_STREAM, u);
    send.setClipData(ClipData.newRawUri("", u));
    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    try { startActivity(Intent.createChooser(send, "Gadgetbridge'e gönder")); }
    catch (Exception e) { Toast.makeText(this, "Dosyayı açacak uygulama bulunamadı.", Toast.LENGTH_LONG).show(); }
  }

  class Bridge {
    @JavascriptInterface public String save(String name, String b64) {
      try {
        String where = saveFile(name.replaceAll("[^A-Za-z0-9._-]", "_"), Base64.decode(b64, Base64.DEFAULT));
        return "ok:" + where;
      } catch (Exception e) {
        return "err:" + e.getMessage();
      }
    }
    @JavascriptInterface public void open() { runOnUiThread(MainActivity.this::openLast); }
  }
}
