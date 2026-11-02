import { useState } from "react";
import { Text } from "react-native";
import { Flag } from "lucide-react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { ReportProblem } from "./ReportProblem";

type Props = {
  /** Which AI feature produced the content, e.g. "AI Studio Shoot". */
  feature: string;
  /** Product / job id, so the team can find the output. */
  contentRef?: string;
  /** Use on dark backgrounds (try-on screens). */
  dark?: boolean;
};

/**
 * "Report" control for AI-generated output (Google Play AI-Generated Content
 * policy: users must be able to flag objectionable AI content in-app).
 * Reuses the Report a Problem sheet; the report lands in the same bug-report
 * inbox, tagged `[AI content report: <feature>]`.
 */
export function ReportAiContent({ feature, contentRef, dark }: Props) {
  const [open, setOpen] = useState(false);
  const color = dark ? "#ffffffcc" : "#6b7280";
  return (
    <>
      <AnimatedPressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Report this AI-generated content"
        hitSlop={8}
        className="flex-row items-center justify-center gap-1.5 py-2"
      >
        <Flag size={13} color={color} />
        <Text style={{ color, fontSize: 12, fontWeight: "600" }}>
          Report this AI content
        </Text>
      </AnimatedPressable>
      {open ? (
        <ReportProblem
          visible
          onClose={() => setOpen(false)}
          aiContent={{ feature, ref: contentRef }}
        />
      ) : null}
    </>
  );
}
