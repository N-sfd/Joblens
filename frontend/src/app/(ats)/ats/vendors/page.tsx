import OrganizationsView from "@/components/crm/OrganizationsView";

export default function VendorsPage() {
  return (
    <OrganizationsView
      title="Vendors"
      subtitle="Staffing vendors and implementation partners you receive requirements from."
      detailBasePath="/ats/vendors"
      types={["Staffing Vendor", "Implementation Partner", "Managed Service Provider"]}
      defaultType="Staffing Vendor"
    />
  );
}
