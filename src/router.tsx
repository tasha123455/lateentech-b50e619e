import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "./contexts/LanguageContext";
import Index from "./pages/Index";

function App() {
  return (
    <LanguageProvider>
      {/* 
        Tailwind rtl: modifiers are automatically triggered 
        by the dir="rtl" applied in the LanguageProvider 
      */}
      <div className="min-h-screen bg-slate-50 text-slate-900 rtl:leading-[1.6]">
        <Router>
          <Routes>
            <Route path="/" element={<Index />} />
            {/* Add other dashboard routes here */}
          </Routes>
        </Router>
      </div>
    </LanguageProvider>
  );
}

export default App;
