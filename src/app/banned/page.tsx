import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { ShieldBan, AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function BannedPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-zinc-950 p-4 overflow-hidden relative">
      {/* Background Gradient Effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-900/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-red-900/40 to-transparent" />
      <div className="absolute bottom-0 inset-x-0 h-px bg-linear-to-r from-transparent via-red-900/40 to-transparent" />

      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#18181b_1px,transparent_1px),linear-gradient(to_bottom,#18181b_1px,transparent_1px)] bg-size-[4rem_4rem] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20 pointer-events-none" />

      <Card className="w-full max-w-md bg-zinc-900/80 backdrop-blur-xl border-red-900/30 shadow-2xl relative z-10 overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1 bg-linear-to-r from-red-600 via-red-500 to-red-600" />
        
        <CardHeader className="text-center pb-2">
          <div className="mx-auto bg-red-500/10 border border-red-500/20 p-4 rounded-full w-fit mb-6 shadow-lg shadow-red-900/20 ring-1 ring-red-500/20">
            <ShieldBan className="size-10 text-red-500" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
            Access Suspended
          </h1>
          <div className="flex items-center justify-center gap-2 text-red-400 bg-red-950/30 py-1.5 px-3 rounded-full w-fit mx-auto border border-red-900/30">
            <AlertTriangle className="size-3.5" />
            <span className="text-xs font-medium uppercase tracking-wider">Account Banned</span>
          </div>
        </CardHeader>

        <CardContent className="text-center space-y-4 pt-6 px-8">
          <p className="text-zinc-400 text-sm leading-relaxed">
            Your account has been flagged for violating our community guidelines or terms of service. 
            As a result, your access to the platform has been temporarily or permanently restricted.
          </p>
         
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pb-8 px-8">
     
          
          <Button 
            asChild 
            variant="ghost" 
            className="w-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
          >
            <Link href="/" className="flex items-center gap-2">
              <ArrowLeft className="size-4" />
              Return to Homepage
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
