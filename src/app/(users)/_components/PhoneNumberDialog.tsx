"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { updatePhoneNumberAction } from "@/app/data/user/user-actions";
import { Loader2, Phone, Sparkles } from "lucide-react";

const formSchema = z.object({
  phoneNumber: z.string().min(10, {
    message: "Phone number must be at least 10 digits.",
  }).regex(/^\+?[0-9\s-]+$/, {
    message: "Invalid phone number format.",
  }),
});

interface PhoneNumberDialogProps {
  isOpen: boolean;
}

export function PhoneNumberDialog({ isOpen }: PhoneNumberDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      phoneNumber: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    startTransition(async () => {
      const result = await updatePhoneNumberAction(values.phoneNumber);
      if (result.status === "success") {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        showCloseButton={false}
        className="sm:max-w-md border-2 shadow-2xl backdrop-blur-sm bg-card/95 overflow-hidden p-0 gap-0"
      >
        <div className="p-6 space-y-4">
          <DialogHeader className="space-y-1 text-center">
            <div className="mx-auto size-12 rounded-full bg-primary/10 flex items-center justify-center mb-2 text-primary">
              <Sparkles className="size-6" />
            </div>
            <DialogTitle className="text-2xl font-black tracking-tight uppercase">One Last Step</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Please provide your phone number to continue accessing our premium courses.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold uppercase text-[10px] tracking-widest text-muted-foreground">Phone Number</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input 
                          placeholder="+1 234 567 890" 
                          className="pl-10 h-10 bg-muted/30 border-2 focus-visible:ring-primary/20" 
                          {...field} 
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <Button 
                  type="submit" 
                  className="w-full h-11 font-bold uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-[0.99]" 
                  disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Complete Profile"
                )}
              </Button>
            </form>
          </Form>
          <p className="text-[10px] text-muted-foreground uppercase text-center mt-4 tracking-tight opacity-50">
            Next Career Labs — Empowering Your Growth
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
