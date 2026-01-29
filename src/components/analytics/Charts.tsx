"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";


interface ChartProps {
  data: any[];
  className?: string;
}

// 1. Line Chart for User Growth
const growthConfig = {
  value: {
    label: "New Users",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

export function SimpleLineChart({ data, className }: ChartProps) {
  // Safety check: handle undefined or empty data
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        No growth data available
      </div>
    );
  }

  return (
    <ChartContainer config={growthConfig} className={cn("min-h-[300px] w-full", className)}>
      <LineChart
        accessibilityLayer
        data={data}
        margin={{
          left: 12,
          right: 12,
          top: 20
        }}
      >
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="name"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value) => value.split("-").slice(2).join("/")} 
          tick={{ fill: "var(--muted-foreground)" }}
        />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)" }} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Line
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={3}
          dot={{ fill: "var(--color-value)", r: 4 }}
          activeDot={{ r: 6, strokeWidth: 0 }}
        />
      </LineChart>
    </ChartContainer>
  );
}

// 2. Bar Chart for Popular Courses
const courseConfig = {
  value: {
    label: "Enrollments",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function SimpleBarChart({ data, className }: ChartProps) {
  // Safety check: handle undefined or empty data
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        No course data available
      </div>
    );
  }

  return (
    <ChartContainer config={courseConfig} className={cn("min-h-[300px] w-full", className)}>
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{
          left: 10,
          right: 10
        }}
      >
        <YAxis
          dataKey="name"
          type="category"
          tickLine={false}
          tickMargin={10}
          axisLine={false}
          width={100}
          fontSize={12}
          tick={{ fill: "var(--foreground)" }}
        />
        <XAxis dataKey="value" type="number" hide />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="value" layout="vertical" fill="var(--color-value)" radius={5} barSize={20} />
      </BarChart>
    </ChartContainer>
  );
}

// 3. Pie Chart for Enrollment Distribution
const enrollmentConfig = {
    value: {
        label: "Count",
    },
    Granted: { label: "Granted", color: "var(--chart-1)" },
    Pending: { label: "Pending", color: "var(--chart-2)" },
    Rejected: { label: "Rejected", color: "var(--chart-3)" },
    Revoked: { label: "Revoked", color: "var(--chart-5)" },
} satisfies ChartConfig;

export function SimplePieChart({ data, className }: ChartProps) {
    // Safety check: handle undefined or empty data
    if (!data || !Array.isArray(data) || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                No enrollment data available
            </div>
        );
    }

    const chartData = data.map((item) => {
        const configKey = item.name as keyof typeof enrollmentConfig;
        const color = (enrollmentConfig[configKey] as any)?.color || "var(--primary)";
        return {
            ...item,
            fill: color,
        };
    });

    return (
        <ChartContainer 
            config={enrollmentConfig} 
            className={cn("mx-auto aspect-square max-h-[250px]", className)}
        >
            <PieChart>
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Pie 
                    data={chartData} 
                    dataKey="value" 
                    nameKey="name" 
                    strokeWidth={5}
                    innerRadius={60}
                    outerRadius={85}
                />
            </PieChart>
        </ChartContainer>
    );
}
