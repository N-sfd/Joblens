import ContactsView from "@/components/crm/ContactsView";

export default function ContactsPage() {
  return (
    <ContactsView
      title="Contacts"
      subtitle="All recruiter, vendor, client, and hiring-manager contacts."
      detailBasePath="/crm/contacts"
    />
  );
}
