import OrganizationsView from "@/components/crm/OrganizationsView";

export default function ClientsPage() {
  return (
    <OrganizationsView
      title="Clients"
      subtitle="Direct clients, end clients, and agencies you place consultants with."
      detailBasePath="/ats/clients"
      types={["Direct Client", "End Client", "Government Agency", "Other"]}
      defaultType="Direct Client"
    />
  );
}
