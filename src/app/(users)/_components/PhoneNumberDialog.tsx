/* This component is used to display the phone number dialog */

"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {Form,FormControl,FormField,FormItem,FormLabel,FormMessage} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import { toast } from "sonner";
import { updateProfileAction } from "@/app/data/user/user-actions";
import { useQueryClient } from "@tanstack/react-query";
import { chatCache } from "@/lib/chat-cache";
import { AlertTriangle, Loader2, Phone, Sparkles, User } from "lucide-react";
import { formSchema } from "@/lib/zodSchemas";
import { PhoneNumberDialogProps } from "@/lib/types/homePage";

// PhoneNumberDialog component 
export function PhoneNumberDialog({ isOpen, requireName = false }: PhoneNumberDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(
      requireName
        ? formSchema.extend({
            name: z.string().min(2, { message: "Name is required." }),
          })
        : formSchema
    ),
    defaultValues: {
      name: "",
      phoneNumber: "",
    },
  });

  // onSubmit function
  function onSubmit(values: z.infer<typeof formSchema>) {
    startTransition(async () => {
      const result = await updateProfileAction({
        name: requireName ? values.name : undefined,
        phoneNumber: values.phoneNumber,
      });
      if (result.status === "success") {
        toast.success(result.message);
        
        // 🔹 FORCE CACHE INVALIDATION
        // Wrap in timeout so React finishes the submit transition before nuking cache
        setTimeout(() => {
            chatCache.invalidate("auth_session");
            
            // Clear all dashboard caches since their profile changed
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.includes("user_dashboard")) {
                    localStorage.removeItem(key);
                }
            });

            queryClient.invalidateQueries({ queryKey: ["auth_session"] });
            
            router.refresh();
        }, 50);
      } else {
        toast.error(result.message);
      }
    });
  }

  // PhoneNumberDialog component
  return (
    <Dialog open={isOpen} onOpenChange={() => { }}>
      <DialogContent showCloseButton={false} className="sm:max-w-md border-2 shadow-2xl backdrop-blur-sm bg-card/95 overflow-hidden p-0 gap-0">
        <div className="p-6 space-y-4">
          <DialogHeader className="space-y-1 text-center">
            <div className="mx-auto size-12 rounded-full bg-primary/10 flex items-center justify-center mb-2 text-primary">
              <Sparkles className="size-6" />
            </div>
            <DialogTitle className="text-2xl font-black tracking-tight uppercase">One Last Step</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              {requireName 
                ? "Please provide your name and phone number to continue accessing our premium courses."
                : "Please provide your phone number to continue accessing our premium courses."
              }
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {requireName && (
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold uppercase text-[10px] tracking-widest text-muted-foreground">Full Name</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                          <Input 
                            disabled={isPending}
                            placeholder="John Doe" 
                            className="pl-10 h-10 bg-muted/30 border-2 focus-visible:ring-primary/20" 
                            {...field} 
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
              )}

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
                          disabled={isPending}
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

              {/* Warning message */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                <p className="text-[11px] leading-relaxed">
                  <strong>One-time setup:</strong> This information cannot be changed later. For any updates, please contact our support team.
                </p>
              </div>

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
            Skillforce Cloud — Empowering Your Growth
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
