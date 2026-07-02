import ContactsView from "@/components/crm/ContactsView";

export default function RecruitersPage() {
  return (
    <ContactsView
      title="Recruiters"
      subtitle="Recruiter contacts who send you job requirements."
      detailBasePath="/ats/recruiters"
      fixedType="Recruiter"
    />
  );
}
