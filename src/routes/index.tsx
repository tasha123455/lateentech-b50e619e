import { useLanguage } from "@/i18n/LanguageContext";
import { Package, Truck, BarChart3, Globe } from "lucide-react";

export default function Index() {
  const { lang, setLang, t } = useLanguage();

  const features = [
    {
      title: t("Automated Tracking"),
      description: t("Sync orders from international suppliers instantly."),
      icon: <Package className="w-6 h-6 text-indigo-600" />,
    },
    {
      title: t("Delegate Management"),
      description: t("Track commissions and delivery statuses in real-time."),
      icon: <Truck className="w-6 h-6 text-indigo-600" />,
    },
    {
      title: t("Financial Analytics"),
      description: t("Monitor profit margins and automated salary distributions."),
      icon: <BarChart3 className="w-6 h-6 text-indigo-600" />,
    },
  ];

  return (
    <div className="w-full">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Globe className="w-8 h-8 text-indigo-600" />
          <span className="text-xl font-bold tracking-tight">Lateen</span>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            className="px-3 py-1.5 text-sm font-medium transition-colors border rounded-md border-slate-200 hover:bg-slate-100 text-start"
          >
            {lang === "ar" ? "English" : "العربية"}
          </button>
          <button className="px-4 py-2 text-sm font-semibold text-white transition-colors bg-indigo-600 rounded-md hover:bg-indigo-700">
            {t("Sign in")}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="max-w-5xl px-6 py-24 mx-auto text-center md:py-32">
        <h1 className="text-4xl font-extrabold tracking-tight md:text-6xl text-slate-900">
          {t("Global Shipping & Logistics")}
        </h1>
        <p className="max-w-2xl mx-auto mt-6 text-lg text-slate-600">
          {t(
            "Manage your international dropshipping operations, delegate commissions, and automated order tracking seamlessly.",
          )}
        </p>
        <div className="flex justify-center gap-4 mt-10">
          <button className="px-6 py-3 text-base font-medium text-white transition-colors bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm">
            {t("Get Started")}
          </button>
          <button className="px-6 py-3 text-base font-medium transition-colors bg-white border border-slate-200 text-slate-900 rounded-lg hover:bg-slate-50 shadow-sm">
            {t("Dashboard")}
          </button>
        </div>
      </header>

      {/* Bento Grid Features */}
      <section className="max-w-6xl px-6 pb-24 mx-auto">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {features.map((feature, idx) => (
            <div
              key={idx}
              className="p-6 transition-shadow bg-white border border-slate-200 rounded-2xl hover:shadow-md text-start"
            >
              <div className="flex items-center justify-center w-12 h-12 mb-4 rounded-xl bg-indigo-50">
                {feature.icon}
              </div>
              <h3 className="mb-2 text-xl font-bold text-slate-900">{feature.title}</h3>
              <p className="text-slate-600 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
