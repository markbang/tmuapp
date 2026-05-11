package dev.tmuapp.mobile;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private EditText apiBase;
    private EditText sessionName;
    private EditText target;
    private EditText input;
    private TextView output;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle("tmuapp");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(24, 24, 24, 24);
        root.setBackgroundColor(0xFF010102);

        TextView title = label("tmuapp", 22, 0xFFF7F8F8);
        TextView subtitle = label("tmux sessions, panes, ANSI capture", 14, 0xFF8A8F98);

        apiBase = new EditText(this);
        apiBase.setSingleLine(true);
        apiBase.setText("http://10.0.2.2:8787");
        apiBase.setTextColor(0xFFF7F8F8);
        apiBase.setHintTextColor(0xFF8A8F98);
        apiBase.setHint("API base URL");
        apiBase.setBackgroundColor(0xFF141516);

        sessionName = field("Session name", "work");
        target = field("tmux target", "%1");
        input = field("Pane input", "pwd");

        Button refresh = new Button(this);
        refresh.setText("Refresh sessions");
        refresh.setOnClickListener((view) -> request("GET", "/api/sessions", null));

        Button health = new Button(this);
        health.setText("Health");
        health.setOnClickListener((view) -> request("GET", "/health", null));

        Button createSession = new Button(this);
        createSession.setText("Create session");
        createSession.setOnClickListener((view) -> request("POST", "/api/sessions", "{\"name\":\"" + escape(sessionName.getText().toString()) + "\"}"));

        Button killSession = new Button(this);
        killSession.setText("Kill target session");
        killSession.setOnClickListener((view) -> request("DELETE", "/api/sessions/" + encode(target.getText().toString()), null));

        Button capturePane = new Button(this);
        capturePane.setText("Capture pane");
        capturePane.setOnClickListener((view) -> request("GET", "/api/panes/" + encode(target.getText().toString()) + "/capture?lines=120", null));

        Button sendInput = new Button(this);
        sendInput.setText("Send input");
        sendInput.setOnClickListener((view) -> request("POST", "/api/panes/" + encode(target.getText().toString()) + "/input", "{\"data\":\"" + escape(input.getText().toString()) + "\"}"));

        Button sendEnter = new Button(this);
        sendEnter.setText("Send Enter");
        sendEnter.setOnClickListener((view) -> request("POST", "/api/panes/" + encode(target.getText().toString()) + "/keys", "{\"keys\":[\"Enter\"]}"));

        output = label("", 12, 0xFFF7F8F8);
        output.setTypeface(android.graphics.Typeface.MONOSPACE);
        output.setGravity(Gravity.START);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(output, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        root.addView(title);
        root.addView(subtitle);
        root.addView(apiBase, params());
        root.addView(sessionName, params());
        root.addView(target, params());
        root.addView(input, params());
        root.addView(refresh, params());
        root.addView(health, params());
        root.addView(createSession, params());
        root.addView(killSession, params());
        root.addView(capturePane, params());
        root.addView(sendInput, params());
        root.addView(sendEnter, params());
        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
    }

    private EditText field(String hint, String value) {
        EditText view = new EditText(this);
        view.setSingleLine(true);
        view.setText(value);
        view.setTextColor(0xFFF7F8F8);
        view.setHintTextColor(0xFF8A8F98);
        view.setHint(hint);
        view.setBackgroundColor(0xFF141516);
        return view;
    }

    private TextView label(String text, int size, int color) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setPadding(0, 0, 0, 12);
        return view;
    }

    private LinearLayout.LayoutParams params() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, 8, 0, 8);
        return params;
    }

    private void request(String method, String path, String body) {
        output.setText(method + " " + path + "...");
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(apiBase.getText().toString() + path);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod(method);
                connection.setConnectTimeout(5000);
                connection.setReadTimeout(5000);
                if (body != null) {
                    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                    connection.setDoOutput(true);
                    try (OutputStream stream = connection.getOutputStream()) {
                        stream.write(body.getBytes(StandardCharsets.UTF_8));
                    }
                }
                String responseBody = read(connection.getResponseCode() >= 400 ? connection.getErrorStream() : connection.getInputStream());
                show(responseBody);
            } catch (Exception exception) {
                show(exception.toString());
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        }).start();
    }

    private String encode(String value) {
        try {
            return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20");
        } catch (Exception exception) {
            throw new IllegalArgumentException(exception);
        }
    }

    private String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private String read(java.io.InputStream stream) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
        StringBuilder builder = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            builder.append(line).append('\n');
        }
        return builder.toString();
    }

    private void show(String text) {
        runOnUiThread(() -> output.setText(text));
    }
}
