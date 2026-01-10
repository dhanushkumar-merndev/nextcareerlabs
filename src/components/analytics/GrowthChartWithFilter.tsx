"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, XCircle, Loader2 } from "lucide-react";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SimpleLineChart } from "./Charts";
import { getAdminAnalytics } from "@/app/admin/analytics/analytics";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface GrowthChartWithFilterProps {
    initialData: any[];
}

export function GrowthChartWithFilter({ initialData }: GrowthChartWithFilterProps) {
    const [data, setData] = useState(initialData);
    const [date, setDate] = useState<DateRange | undefined>();
    const [tempDate, setTempDate] = useState<DateRange | undefined>();
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const [isPending, startTransition] = useTransition();

    const handleApplyFilter = () => {
        setIsPopoverOpen(false);
        setDate(tempDate);
        
        startTransition(async () => {
            const result = await getAdminAnalytics(tempDate?.from, tempDate?.to);
            if (result) {
                setData(result.chartData);
            }
        });
    };

    const handleClear = () => {
        setDate(undefined);
        setTempDate(undefined);
        startTransition(async () => {
            const result = await getAdminAnalytics();
            if (result) {
                setData(result.chartData);
            }
        });
    };

    return (
        <>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0 pb-7">
                <div className="space-y-1">
                    <CardTitle>User Growth</CardTitle>
                    <CardDescription>New user registrations over time</CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <Popover open={isPopoverOpen} onOpenChange={(open) => {
                        setIsPopoverOpen(open);
                        if (open) setTempDate(date);
                    }}>
                        <PopoverTrigger asChild>
                            <Button
                                id="date"
                                variant={"outline"}
                                className={cn(
                                    "w-full sm:w-[240px] justify-start text-left font-bold uppercase tracking-widest text-[10px] h-10 sm:h-8 rounded-xl bg-muted/30 border-border/40 hover:bg-muted/50 transition-all shadow-sm",
                                    !date && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-3 w-3 opacity-60" />
                                {date?.from ? (
                                    date.to ? (
                                        <>
                                            {format(date.from, "LLL dd, y")} -{" "}
                                            {format(date.to, "LLL dd, y")}
                                        </>
                                    ) : (
                                        format(date.from, "LLL dd, y")
                                    )
                                ) : (
                                    <span>Filter Date</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 rounded-2xl border-2 border-border/40 shadow-2xl overflow-hidden backdrop-blur-xl bg-card/95 flex flex-col" align="end">
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={date?.from}
                                selected={tempDate}
                                onSelect={setTempDate}
                                numberOfMonths={2}
                                disabled={{ after: new Date() }}
                                className="p-4"
                            />
                            <div className="p-4 border-t border-border/40 bg-muted/20 flex justify-end">
                                <Button 
                                    size="sm" 
                                    onClick={handleApplyFilter}
                                    className="font-bold uppercase tracking-widest text-[10px] px-6 h-8 rounded-lg shadow-lg shadow-primary/20"
                                >
                                    Apply
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>

                    {date && (
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={handleClear}
                            className="h-10 w-full sm:h-8 sm:w-8 rounded-xl text-destructive hover:text-destructive/80 hover:bg-destructive/10 border border-border/40 shrink-0"
                        >
                            <XCircle className="size-4" />
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <div className="relative">
                    {isPending && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-sm rounded-lg">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    )}
                    <SimpleLineChart data={data} />
                </div>
            </CardContent>
        </>
    );
}
