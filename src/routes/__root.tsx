import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/auth/AuthContext";
import { InstallPrompt } from "@/components/InstallPrompt";
import { LanguageGate } from "@/i18n/LanguageGate";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Wasla — Your smartest link to modern commerce" },
      { name: "description", content: "Wasla connects businesses with marketers to sell products and track verified payouts." },
      { name: "author", content: "Wasla" },
      { property: "og:title", content: "Wasla — Your smartest link to modern commerce" },
      { property: "og:description", content: "Connect businesses and marketers with verified orders, wallets, and payouts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "theme-color", content: "#080808" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "icon", href: "/wasla-icon-192.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/wasla-icon-192.png" },
    ],

  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {/* Sets html[lang]/[dir] synchronously BEFORE anything paints, based
            on the /en or /ar URL prefix. Fallback: stored preference, then
            navigator.language, then English. Language layout routes then
            re-assert the same values via LanguageProvider once React
            hydrates — this inline script only prevents a first-paint flash
            for Arabic. */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var p=location.pathname||'';var lang=/^\\/ar(\\/|$)/.test(p)?'ar':/^\\/en(\\/|$)/.test(p)?'en':null;if(!lang){try{var s=localStorage.getItem('lateen_lang');if(s==='ar'||s==='en')lang=s;}catch(e){}}if(!lang){try{var n=(navigator.language||'').toLowerCase();lang=n.indexOf('ar')===0?'ar':'en';}catch(e){lang='en';}}var h=document.documentElement;h.setAttribute('lang',lang);h.setAttribute('dir',lang==='ar'?'rtl':'ltr');}catch(e){}})();",
          }}
        />
        {/* First visit only: hide the whole app until a language is picked. */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var s=localStorage.getItem('lateen_lang');if(s!=='ar'&&s!=='en'){document.documentElement.classList.add('lang-pending');}}catch(e){}})();",
          }}
        />
        {/* Somebody arriving already signed in, or coming back from Google
            mid-sign-in, lands on the front page — that is where Google returns
            people. Until React has hydrated and worked out who they are, the
            front page's "who are you?" is the wrong thing to show them, and
            React cannot decide it any earlier: its first render has to match
            the one the server sent, and the server has neither their storage
            nor their address bar. This runs before the first paint, which is
            the only moment early enough, and marks the document so the CSS can
            show the mark instead. React takes the mark down again the moment
            it knows nobody is coming. */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var h=document.documentElement;var s=location.search||'';var f=location.hash||'';" +
              "if(/[?&]code=/.test(s)||/access_token=|error_description=/.test(f)){h.classList.add('auth-pending');return;}" +
              "try{if(sessionStorage.getItem('signin_intent')||sessionStorage.getItem('pending_signup')){h.classList.add('auth-pending');return;}}catch(e){}" +
              "for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);" +
              "if(k&&k.indexOf('sb-')===0&&k.indexOf('-auth-token')>0){var v=localStorage.getItem(k);" +
              "if(v&&v!=='null'&&v.length>2){h.classList.add('auth-pending');return;}}}}catch(e){}})();",
          }}
        />

        <AuthProvider>{children}</AuthProvider>

        {/* Chrome fires `beforeinstallprompt` very early — often before React
            hydrates. Stash it on window so <InstallPrompt/> can still use it. */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html:
              "(function(){window.__waslaBIP=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__waslaBIP=e;try{window.dispatchEvent(new Event('wasla-bip'));}catch(x){}});})();",
          }}
        />
        <InstallPrompt />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <LanguageGate />
    </QueryClientProvider>
  );
}

