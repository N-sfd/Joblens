import { Mail, Users, Heart, CalendarClock, type LucideIcon } from "lucide-react";
import type { ReminderType } from "@/types";

export const REMINDER_TYPES: { value: ReminderType; label: string }[] = [
  { value: "follow_up_email", label: "Follow-up Email" },
  { value: "interview", label: "Interview" },
  { value: "thank_you_email", label: "Thank-you Email" },
  { value: "application_deadline", label: "Application Deadline" },
];

export const REMINDER_TYPE_LABEL: Record<ReminderType, string> = {
  follow_up_email: "Follow-up Email",
  interview: "Interview",
  thank_you_email: "Thank-you Email",
  application_deadline: "Application Deadline",
};

export const REMINDER_TYPE_ICON: Record<ReminderType, LucideIcon> = {
  follow_up_email: Mail,
  interview: Users,
  thank_you_email: Heart,
  application_deadline: CalendarClock,
};

export const REMINDER_TYPE_COLOR: Record<ReminderType, string> = {
  follow_up_email: "bg-emerald-100 text-emerald-700",
  interview: "bg-purple-100 text-purple-700",
  thank_you_email: "bg-pink-100 text-pink-700",
  application_deadline: "bg-amber-100 text-amber-700",
};
