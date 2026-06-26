"use client";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

const NOANIM = { animations: { enabled: false } } as const;
const FONT = "Inter, system-ui, sans-serif";

function shade(hex: string, p: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r + (255 - r) * p); g = Math.round(g + (255 - g) * p); b = Math.round(b + (255 - b) * p);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/* ---------- Radial (single % gauge) ---------- */
export function Radial({ value, color = "#2563EB", size = 118 }: { value: number; color?: string; size?: number }) {
  const opts: ApexOptions = {
    chart: { type: "radialBar", sparkline: { enabled: true }, ...NOANIM, fontFamily: FONT },
    plotOptions: {
      radialBar: {
        hollow: { size: "58%" },
        track: { background: "#eef1f7" },
        dataLabels: {
          name: { show: false },
          value: { offsetY: 6, fontSize: "20px", fontWeight: 800, color: "#0F1B3D", formatter: (v) => `${Math.round(Number(v))}%` },
        },
      },
    },
    fill: { type: "gradient", gradient: { shade: "light", gradientToColors: [shade(color, 0.35)], stops: [0, 100] } },
    colors: [color], stroke: { lineCap: "round" },
  };
  return <Chart type="radialBar" series={[value]} options={opts} height={size} width={size} />;
}

/* ---------- Gauge (semicircle) ---------- */
export function Gauge({ value, color = "#2563EB", height = 220 }: { value: number; color?: string; height?: number }) {
  const opts: ApexOptions = {
    chart: { type: "radialBar", ...NOANIM, fontFamily: FONT },
    plotOptions: {
      radialBar: {
        startAngle: -110, endAngle: 110, hollow: { size: "62%" },
        track: { background: "#eef1f7", strokeWidth: "100%" },
        dataLabels: {
          name: { offsetY: 22, color: "#8a93a6", fontSize: "13px", fontWeight: 600 },
          value: { offsetY: -14, fontSize: "30px", fontWeight: 800, color: "#0F1B3D", formatter: (v) => `${Math.round(Number(v))}%` },
        },
      },
    },
    fill: { type: "gradient", gradient: { shade: "light", gradientToColors: [shade(color, 0.3)], stops: [0, 100] } },
    colors: [color], stroke: { lineCap: "round" }, labels: ["Completion"],
  };
  return <Chart type="radialBar" series={[value]} options={opts} height={height} />;
}

/* ---------- Donut ---------- */
export function Donut({ series, labels, colors, height = 240 }: { series: number[]; labels: string[]; colors: string[]; height?: number }) {
  const opts: ApexOptions = {
    chart: { type: "donut", ...NOANIM, fontFamily: FONT },
    labels, colors, legend: { show: false },
    dataLabels: { enabled: false },
    stroke: { width: 2, colors: ["#fff"] },
    plotOptions: { pie: { donut: { size: "70%" } } },
    tooltip: { enabled: true },
  };
  return <Chart type="donut" series={series} options={opts} height={height} />;
}

/* ---------- Bars (vertical) ---------- */
export function Bars({ categories, data, color = "#2563EB", height = 260, label = "Value" }: { categories: string[]; data: number[]; color?: string; height?: number; label?: string }) {
  const opts: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, ...NOANIM, fontFamily: FONT },
    plotOptions: { bar: { borderRadius: 7, columnWidth: "45%" } },
    colors: [color], dataLabels: { enabled: false },
    grid: { borderColor: "#eef1f7", strokeDashArray: 4 },
    xaxis: { categories, labels: { style: { colors: "#8a93a6", fontSize: "12px" } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: "#8a93a6", fontSize: "12px" } } },
  };
  return <Chart type="bar" series={[{ name: label, data }]} options={opts} height={height} />;
}

/* ---------- Horizontal bars (color per item) ---------- */
export function HBars({ categories, data, colors, height = 280 }: { categories: string[]; data: number[]; colors?: string[]; height?: number }) {
  const opts: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, ...NOANIM, fontFamily: FONT },
    plotOptions: { bar: { borderRadius: 6, horizontal: true, barHeight: "60%", distributed: !!colors } },
    colors: colors || ["#2563EB"],
    dataLabels: { enabled: true, style: { fontSize: "12px", fontWeight: 700, colors: ["#0F1B3D"] }, offsetX: 22 },
    legend: { show: false },
    grid: { borderColor: "#eef1f7", strokeDashArray: 4 },
    xaxis: { categories, labels: { style: { colors: "#8a93a6", fontSize: "12px" } } },
    yaxis: { labels: { style: { colors: "#475467", fontSize: "12.5px", fontWeight: 600 } } },
  };
  return <Chart type="bar" series={[{ name: "Total", data }]} options={opts} height={height} />;
}

/* ---------- Area (trend) ---------- */
export function Area({ categories, data, color = "#2563EB", height = 240, label = "Value" }: { categories: string[]; data: number[]; color?: string; height?: number; label?: string }) {
  const opts: ApexOptions = {
    chart: { type: "area", toolbar: { show: false }, ...NOANIM, fontFamily: FONT },
    colors: [color], dataLabels: { enabled: false }, stroke: { curve: "smooth", width: 3 },
    fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.02 } },
    grid: { borderColor: "#eef1f7", strokeDashArray: 4 },
    xaxis: { categories, labels: { style: { colors: "#8a93a6", fontSize: "12px" } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: "#8a93a6", fontSize: "12px" } } },
  };
  return <Chart type="area" series={[{ name: label, data }]} options={opts} height={height} />;
}

/* ---------- Grouped (clustered) bars ---------- */
export function Grouped({ categories, series, colors, height = 260 }: { categories: string[]; series: { name: string; data: number[] }[]; colors: string[]; height?: number }) {
  const opts: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, ...NOANIM, fontFamily: FONT },
    plotOptions: { bar: { borderRadius: 5, columnWidth: "62%", borderRadiusApplication: "end" } },
    colors, dataLabels: { enabled: false }, legend: { show: true, position: "top", horizontalAlign: "right", fontSize: "12px", labels: { colors: "#475467" }, markers: { size: 6 } },
    grid: { borderColor: "#eef1f7", strokeDashArray: 4 },
    xaxis: { categories, labels: { style: { colors: "#8a93a6", fontSize: "12px" } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: "#8a93a6", fontSize: "12px" } } },
  };
  return <Chart type="bar" series={series} options={opts} height={height} />;
}

/* ---------- Donut with center total ---------- */
export function DonutTotal({ series, labels, colors, height = 240, total }: { series: number[]; labels: string[]; colors: string[]; height?: number; total: number }) {
  const opts: ApexOptions = {
    chart: { type: "donut", ...NOANIM, fontFamily: FONT },
    labels, colors, legend: { show: false },
    dataLabels: { enabled: false },
    stroke: { width: 2, colors: ["#fff"] },
    plotOptions: { pie: { donut: { size: "72%", labels: { show: true,
      name: { show: true, offsetY: 22, color: "#8a93a6", fontSize: "13px", fontWeight: 600 },
      value: { show: true, offsetY: -16, color: "#0F1B3D", fontSize: "30px", fontWeight: 800 },
      total: { show: true, label: "Total", color: "#8a93a6", fontSize: "13px", fontWeight: 600, formatter: () => String(total) },
    } } } },
    tooltip: { enabled: true },
  };
  return <Chart type="donut" series={series} options={opts} height={height} />;
}

/* ---------- Stacked bars ---------- */
export function Stacked({ categories, series, colors, height = 260 }: { categories: string[]; series: { name: string; data: number[] }[]; colors: string[]; height?: number }) {
  const opts: ApexOptions = {
    chart: { type: "bar", stacked: true, toolbar: { show: false }, ...NOANIM, fontFamily: FONT },
    plotOptions: { bar: { borderRadius: 5, columnWidth: "48%" } },
    colors, dataLabels: { enabled: false }, legend: { show: true, position: "top", horizontalAlign: "right", fontSize: "12px", labels: { colors: "#475467" }, markers: { size: 6 } },
    grid: { borderColor: "#eef1f7", strokeDashArray: 4 },
    xaxis: { categories, labels: { style: { colors: "#8a93a6", fontSize: "12px" } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: "#8a93a6", fontSize: "12px" } } },
  };
  return <Chart type="bar" series={series} options={opts} height={height} />;
}
