import { request } from "./client";

export type BugReportSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type BugReportSubmission = {
  description: string;
  severity?: BugReportSeverity;
  app_version?: string;
  os_version?: string;
  device_model?: string;
  screen_name?: string;
  last_screen?: string;
  error_message?: string;
  error_stack?: string;
  screenshot_url?: string;
  screenshot_r2_key?: string;
  notes?: string;
};

export const bugReportApi = {
  /** Submit a bug report from the mobile app */
  submit: (data: BugReportSubmission) =>
    request<{ data: { id: string; status: string; created_at: string } }>(
      "/v1/retailers/me/bug-reports",
      {
        method: "POST",
        body: JSON.stringify(data),
        timeoutMs: 15_000,
      },
    ),
};
