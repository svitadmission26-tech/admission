declare module "svelte-apexcharts" {
  import type { SvelteComponent } from "svelte";
  const ApexCharts: SvelteComponent<{
    type: string;
    options: any;
    series: any;
    height?: string | number;
  }>;
  export default ApexCharts;
}
