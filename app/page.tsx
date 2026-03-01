"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Car,
  Bike,
  Truck,
  Bus,
  Clock,
  FileText,
  Settings,
  PlusCircle,
  LogOut,
  QrCode,
  TrendingUp,
  Search,
  CheckCircle2,
  AlertCircle,
  History,
  ShieldCheck,
  Timer,
  Gift,
  Upload,
  Image as ImageIcon,
  ChevronRight,
  ArrowRight,
  CreditCard,
  RefreshCw,
  User,
  Calendar,
  Camera
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { format, differenceInMinutes, addMonths, isAfter, isBefore } from "date-fns";
import { supabase } from "@/lib/supabase";
import { isAuthenticated, logout, getUserId } from "@/lib/auth";

// Types
type VehicleType = "bike" | "car" | "truck" | "bus";

interface ParkingSession {
  id: string;
  vehicleNumber: string;
  vehicleType: VehicleType;
  entryTime: string;
  exitTime?: string;
  amount?: number;
  durationMinutes?: number;
  isFree?: boolean;
  proofImage?: string; // Base64 for demo
  status: "active" | "completed";
}

interface MembershipPass {
  id: string;
  vehicleNumber: string;
  vehicleType: VehicleType;
  holderName: string;
  expiryDate: string; // ISO string
}

interface PricingRule {
  hours: number;
  amount: number;
}

const VEHICLE_TYPES: { type: VehicleType; icon: any; label: string }[] = [
  { type: "bike", icon: Bike, label: "Two Wheeler" },
  { type: "car", icon: Car, label: "Four Wheeler" },
  { type: "truck", icon: Truck, label: "Heavy Vehicle" },
  { type: "bus", icon: Bus, label: "Public Transport" },
];

export default function ParkingSystem() {
  const router = useRouter();

  // Check authentication on component mount
  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
  }, [router]);

  // Persistence and Settings
  const [sessions, setSessions] = useState<ParkingSession[]>([]);
  const [graceTimeMinutes, setGraceTimeMinutes] = useState<number>(15);
  const [pricingRules, setPricingRules] = useState<Record<VehicleType, PricingRule[]>>({
    bike: [{ hours: 1, amount: 20 }, { hours: 12, amount: 150 }, { hours: 24, amount: 250 }],
    car: [{ hours: 1, amount: 50 }, { hours: 12, amount: 500 }, { hours: 24, amount: 900 }],
    truck: [{ hours: 1, amount: 100 }, { hours: 12, amount: 1000 }, { hours: 24, amount: 1800 }],
    bus: [{ hours: 1, amount: 80 }, { hours: 12, amount: 800 }, { hours: 24, amount: 1500 }]
  });
  const [showSettings, setShowSettings] = useState(false);
  const [settingsVehicleType, setSettingsVehicleType] = useState<VehicleType>("car");
  const [passes, setPasses] = useState<MembershipPass[]>([]);

  // Forms
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("car");
  const [isFree, setIsFree] = useState(false);
  const [proofImage, setProofImage] = useState<string | null>(null);

  const [exitId, setExitId] = useState("");
  const [currentBill, setCurrentBill] = useState<ParkingSession | null>(null);
  const [activeTab, setActiveTab] = useState<"entry" | "exit" | "report" | "pass">("entry");

  // Pass Form
  const [passForm, setPassForm] = useState({
    vehicleNumber: "",
    vehicleType: "car" as VehicleType,
    holderName: ""
  });

  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);

  // Vehicle Number Formatter (e.g., TN 18 AV 4064)
  const formatVehicleNumber = (val: string) => {
    const clean = val.replace(/\s+/g, "").toUpperCase();
    const parts = [];
    if (clean.length > 0) parts.push(clean.substring(0, 2));
    if (clean.length > 2) parts.push(clean.substring(2, 4));
    if (clean.length > 4) parts.push(clean.substring(4, 6));
    if (clean.length > 6) parts.push(clean.substring(6, 10));
    return parts.join(" ");
  };

  // Load data from Supabase
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const userId = getUserId();
        if (!userId) {
          router.push('/login');
          return;
        }

        // 1. Fetch Sessions for current user
        const { data: sessionData, error: sessionError } = await supabase
          .from("parking_sessions")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (sessionError) throw sessionError;

        // Map database fields to frontend interface
        const mappedSessions = (sessionData || []).map(session => ({
          id: session.id,
          vehicleNumber: session.vehicle_number,
          vehicleType: session.vehicle_type,
          entryTime: session.entry_time,
          exitTime: session.exit_time,
          amount: session.amount,
          durationMinutes: session.duration_minutes,
          isFree: session.is_free,
          proofImage: session.proof_image,
          status: session.status
        }));
        setSessions(mappedSessions);

        // 2. Fetch Passes for current user
        const { data: passData, error: passError } = await supabase
          .from("membership_passes")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (passError) throw passError;

        // Map database fields to frontend interface
        const mappedPasses = (passData || []).map(pass => ({
          id: pass.id,
          vehicleNumber: pass.vehicle_number,
          vehicleType: pass.vehicle_type,
          holderName: pass.holder_name,
          expiryDate: pass.expiry_date
        }));
        setPasses(mappedPasses);

        // 3. Fetch Settings
        const { data: settingData, error: settingError } = await supabase
          .from("system_settings")
          .select("*");

        if (settingError) throw settingError;

        if (settingData) {
          const grace = settingData.find(s => s.key === "grace_time");
          const rules = settingData.find(s => s.key === "pricing_rules");

          if (grace) setGraceTimeMinutes(Number(grace.value));
          if (rules) setPricingRules(rules.value);
        }
      } catch (err: any) {
        console.error("Critical: Database sync failure", {
          message: err.message,
          details: err.details,
          hint: err.hint,
          code: err.code,
          fullError: err
        });
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // Sync Settings to Supabase when changed
  useEffect(() => {
    if (loading) return; // Prevent overwriting on initial load

    async function syncSettings() {
      await supabase.from("system_settings").upsert({ key: "grace_time", value: graceTimeMinutes });
      await supabase.from("system_settings").upsert({ key: "pricing_rules", value: pricingRules });
    }

    syncSettings();
  }, [graceTimeMinutes, pricingRules, loading]);

  // Handle Entry
  const handleEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleNumber) return;

    const userId = getUserId();
    if (!userId) {
      alert("Authentication error: Please login again");
      router.push('/login');
      return;
    }

    // Check for active session duplication
    const isActive = sessions.find(s => s.vehicleNumber === vehicleNumber && s.status === "active");
    if (isActive) {
      alert("This vehicle is already entered in the parking area.");
      return;
    }

    const existingPass = passes.find(p => p.vehicleNumber === vehicleNumber);
    if (existingPass) {
      const isExpired = isBefore(new Date(existingPass.expiryDate), new Date());
      if (isExpired) {
        alert("MEMBERSHIP EXPIRED: This vehicle cannot enter until the monthly pass is recharged.");
        return;
      }
      setIsFree(true);
    }

    const newSession: ParkingSession = {
      id: `PK-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      vehicleNumber,
      vehicleType,
      entryTime: new Date().toISOString(),
      isFree: existingPass ? true : isFree,
      proofImage: proofImage || undefined,
      status: "active",
    };

    const { error } = await supabase.from("parking_sessions").insert([{
      id: newSession.id,
      vehicle_number: newSession.vehicleNumber,
      vehicle_type: newSession.vehicleType,
      entry_time: newSession.entryTime,
      is_free: newSession.isFree,
      proof_image: newSession.proofImage,
      status: newSession.status,
      user_id: userId
    }]);
    if (error) {
      alert("System Error: Failed to log entry");
      console.error("Database error:", error);
      return;
    }

    setSessions([newSession, ...sessions]);
    setCurrentBill(newSession);

    // Reset form
    setVehicleNumber("");
    setIsFree(false);
    setProofImage(null);
  };

  const createMembership = async (e: React.FormEvent) => {
    e.preventDefault();

    const userId = getUserId();
    if (!userId) {
      alert("Authentication error: Please login again");
      router.push('/login');
      return;
    }

    const newPass: MembershipPass = {
      id: `MS-${Math.random().toString(16).substr(2, 4).toUpperCase()}`,
      ...passForm,
      expiryDate: addMonths(new Date(), 1).toISOString()
    };

    const { error } = await supabase.from("membership_passes").insert([{
      id: newPass.id,
      vehicle_number: newPass.vehicleNumber,
      vehicle_type: newPass.vehicleType,
      holder_name: newPass.holderName,
      expiry_date: newPass.expiryDate,
      user_id: userId
    }]);
    if (error) {
      alert("Error: Vehicle might already have a pass or system offline.");
      console.error("Database error:", error);
      return;
    }

    setPasses([newPass, ...passes]);
    setPassForm({ vehicleNumber: "", vehicleType: "car", holderName: "" });
    alert("Monthly Membership Activated!");
  };

  const rechargePass = async (passId: string) => {
    const pass = passes.find(p => p.id === passId);
    if (!pass) return;

    const userId = getUserId();
    if (!userId) {
      alert("Authentication error: Please login again");
      router.push('/login');
      return;
    }

    const currentExpiry = new Date(pass.expiryDate);
    const baseDate = isAfter(currentExpiry, new Date()) ? currentExpiry : new Date();
    const newExpiry = addMonths(baseDate, 1).toISOString();

    const { error } = await supabase
      .from("membership_passes")
      .update({ expiry_date: newExpiry })
      .eq("id", passId)
      .eq("user_id", userId); // Ensure user can only update their own passes

    if (error) {
      alert("Error: Failed to recharge pass.");
      console.error("Database error:", error);
      return;
    }

    setPasses(passes.map(p => p.id === passId ? { ...p, expiryDate: newExpiry } : p));
    alert("Membership Recharged for 1 Month!");
  };

  // Pricing Logic Engine
  const calculateBill = (session: ParkingSession, exitTime: string) => {
    if (session.isFree) return { amount: 0, durationMinutes: differenceInMinutes(new Date(exitTime), new Date(session.entryTime)) };

    const start = new Date(session.entryTime);
    const end = new Date(exitTime);
    const totalMinutes = differenceInMinutes(end, start);

    if (totalMinutes <= graceTimeMinutes) {
      return { amount: 0, durationMinutes: totalMinutes };
    }

    const currentRules = pricingRules[session.vehicleType] || [];
    const sortedRules = [...currentRules].sort((a, b) => b.hours - a.hours);
    const totalHours = Math.ceil(totalMinutes / 60);
    const applicableRule = sortedRules.find(rule => totalHours >= rule.hours);

    if (applicableRule) {
      return { amount: applicableRule.amount, durationMinutes: totalMinutes };
    }

    const baseHourRate = currentRules.find(r => r.hours === 1)?.amount || 50;
    return { amount: totalHours * baseHourRate, durationMinutes: totalMinutes };
  };

  const handleExit = async (idToExit: string) => {
    const session = sessions.find(s => s.id === idToExit || s.vehicleNumber === idToExit);
    if (!session || session.status === "completed") {
      alert("Active session not found");
      return;
    }

    const userId = getUserId();
    if (!userId) {
      alert("Authentication error: Please login again");
      router.push('/login');
      return;
    }

    const exitTime = new Date().toISOString();
    const { amount, durationMinutes } = calculateBill(session, exitTime);

    const { error } = await supabase
      .from("parking_sessions")
      .update({
        exit_time: exitTime,
        amount,
        duration_minutes: durationMinutes,
        status: "completed"
      })
      .eq("id", session.id)
      .eq("user_id", userId); // Ensure user can only update their own sessions

    if (error) {
      alert("Error: Failed to process exit");
      console.error("Database error:", error);
      return;
    }

    const updatedSessions = sessions.map(s =>
      s.id === session.id
        ? { ...s, exitTime, amount, durationMinutes, status: "completed" as const }
        : s
    );

    setSessions(updatedSessions);
    setCurrentBill({ ...session, exitTime, amount, durationMinutes, status: "completed" });
    setExitId("");
    setShowScanner(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProofImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const QRScanner = ({ onScan, onClose }: { onScan: (data: string) => void, onClose: () => void }) => {
    useEffect(() => {
      const scanner = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );

      scanner.render(
        (data) => {
          onScan(data);
          scanner.clear().catch(error => console.error("Failed to clear scanner", error));
        },
        (err) => { }
      );

      return () => {
        // Use a more reliable way to cleanup
        const element = document.getElementById("qr-reader");
        if (element && element.innerHTML !== "") {
          scanner.clear().catch(error => console.error("Cleanup error", error));
        }
      };
    }, [onScan]);

    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
        <div className="bg-white rounded-[44px] p-10 w-full max-w-lg shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-2 bg-primary group-hover:h-3 transition-all" />
          <div className="flex justify-between items-center mb-10">
            <div>
              <h2 className="text-3xl font-black text-slate-800">Scan Entry Token</h2>
              <p className="text-primary text-[10px] font-black tracking-[0.3em] mt-2 text-left uppercase">Scanning active session</p>
            </div>
            <button onClick={onClose} className="w-12 h-12 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 shadow-sm transition-all focus:scale-95 active:scale-90">
              <PlusCircle className="rotate-45" size={28} />
            </button>
          </div>
          <div id="qr-reader" className="overflow-hidden rounded-[32px] border-4 border-slate-100 bg-slate-50" />
          <div className="mt-10 flex items-center gap-4 p-6 bg-blue-50/50 rounded-3xl border border-blue-100">
            <div className="p-3 bg-blue-100 rounded-2xl text-primary animate-pulse">
              <QrCode size={24} />
            </div>
            <p className="text-[10px] font-bold text-slate-500 leading-relaxed text-left">
              Position the QR code from the entry bill inside the frame to automatically load vehicle details.
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#1e293b] font-sans">
      {showScanner && (
        <QRScanner
          onScan={(id) => {
            const session = sessions.find(s => s.id === id && s.status === "active");
            if (session) {
              setExitId(session.vehicleNumber);
              handleExit(session.vehicleNumber);
            } else {
              alert("No active session found for this token");
              setShowScanner(false);
            }
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
      {/* Header */}
      <header className="sticky top-0 z-50 glass-card mx-2 md:mx-4 mt-4 md:mt-6 rounded-[24px] md:rounded-[32px] px-4 md:px-8 py-4 md:py-5 flex items-center justify-between border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl overflow-hidden shadow-lg shadow-primary/20 bg-white border border-slate-100 p-1">
            <img src="/istockphoto-1349223345-612x612.jpg" alt="Logo" className="w-full h-full object-cover rounded-lg" />
          </div>
          <div>
            <h1 className="text-lg md:text-2xl font-black tracking-tight text-slate-800">Parking System</h1>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
              <p className="text-[8px] md:text-[10px] text-primary font-bold tracking-[0.2em]">Active</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="group flex items-center gap-2 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-100 hover:border-primary/30 transition-all shadow-sm"
        >
          <Settings size={18} className="text-slate-500 group-hover:rotate-90 transition-transform duration-700" />
          <span className="hidden md:block text-xs font-black text-slate-600 tracking-widest">Settings</span>
        </button>

        <button
          onClick={logout}
          className="group flex items-center gap-2 bg-red-50 px-4 py-2.5 rounded-xl border border-red-100 hover:border-red-300 transition-all shadow-sm"
        >
          <LogOut size={18} className="text-red-500 group-hover:translate-x-1 transition-transform duration-300" />
          <span className="hidden md:block text-xs font-black text-red-600 tracking-widest">Logout</span>
        </button>
      </header>

      {/* Advanced Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
          <div className="glass-card max-w-xl w-full p-0 rounded-[44px] shadow-2xl overflow-hidden border-white/50 animate-in fade-in zoom-in duration-300">
            <div className="bg-slate-50 p-10 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black text-slate-800">System Settings</h2>
                <p className="text-primary text-[10px] font-black tracking-[0.3em] mt-2">Manage pricing and policies</p>
              </div>
              <button onClick={() => setShowSettings(false)} className="w-12 h-12 flex items-center justify-center bg-white border border-slate-200 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 shadow-sm transition-all">
                <PlusCircle className="rotate-45" size={28} />
              </button>
            </div>

            <div className="p-10 space-y-10 max-h-[70vh] overflow-y-auto">
              {/* Grace Time Rule */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-primary">
                  <div className="p-2 bg-primary/5 rounded-xl"><Timer size={20} /></div>
                  <h3 className="font-black text-sm tracking-wider">Grace Period Policy</h3>
                </div>
                <div className="bg-slate-50 p-8 rounded-[32px] border border-slate-100 shadow-inner">
                  <div className="flex items-center justify-between mb-4 px-2">
                    <label className="text-xs font-black text-secondary tracking-widest">Free buffer limit</label>
                    <span className="px-5 py-2 bg-white rounded-2xl border border-slate-200 font-black text-primary text-lg">
                      {graceTimeMinutes} MIN
                    </span>
                  </div>
                  <input
                    type="range" min="0" max="60" step="5"
                    value={graceTimeMinutes}
                    onChange={(e) => setGraceTimeMinutes(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
              </div>

              {/* Pricing Rules */}
              <div className="flex items-center gap-3 text-primary mb-6">
                <div className="p-2 bg-primary/5 rounded-xl"><TrendingUp size={20} /></div>
                <h3 className="font-black text-sm tracking-wider">Pricing Rules</h3>
              </div>

              {/* Rules Vehicle Switcher */}
              <div className="flex gap-2 mb-6 p-1 bg-slate-100 rounded-[24px] border border-slate-200">
                {VEHICLE_TYPES.map((v) => (
                  <button
                    key={v.type}
                    onClick={() => setSettingsVehicleType(v.type)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[20px] transition-all duration-500 font-black text-[9px] tracking-widest ${settingsVehicleType === v.type
                      ? "bg-white text-primary shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                      }`}
                  >
                    <v.icon size={14} />
                    {v.label}
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                {(pricingRules[settingsVehicleType] || []).map((rule, index) => (
                  <div key={index} className="flex items-center gap-4 p-5 bg-white rounded-[24px] border border-slate-100 shadow-sm group hover:border-primary/20 transition-all">
                    <div className="flex-1">
                      <p className="text-[9px] font-black text-slate-400 tracking-tighter mb-2 ml-1 text-center">Duration (Hours)</p>
                      <input
                        type="number"
                        value={rule.hours}
                        onChange={(e) => {
                          const newRules = { ...pricingRules };
                          newRules[settingsVehicleType][index].hours = Number(e.target.value);
                          setPricingRules(newRules);
                        }}
                        className="w-full bg-slate-50 rounded-2xl px-5 py-3 font-black text-center outline-none focus:bg-white focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all"
                      />
                    </div>
                    <div className="bg-slate-100 h-10 w-[1px] mt-4" />
                    <div className="flex-1">
                      <p className="text-[9px] font-black text-slate-400 tracking-tighter mb-2 ml-1 text-center">Amount (₹)</p>
                      <input
                        type="number"
                        value={rule.amount}
                        onChange={(e) => {
                          const newRules = { ...pricingRules };
                          newRules[settingsVehicleType][index].amount = Number(e.target.value);
                          setPricingRules(newRules);
                        }}
                        className="w-full bg-slate-50 rounded-2xl px-5 py-3 font-black text-center outline-none focus:bg-white focus:ring-4 focus:ring-primary/5 border border-transparent focus:border-primary/20 transition-all"
                      />
                    </div>
                    <button
                      onClick={() => {
                        const newRules = { ...pricingRules };
                        newRules[settingsVehicleType] = newRules[settingsVehicleType].filter((_, i) => i !== index);
                        setPricingRules(newRules);
                      }}
                      className="mt-6 p-2 text-red-300 hover:text-red-500 transition-colors"
                    >
                      <AlertCircle size={20} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const newRules = { ...pricingRules };
                    newRules[settingsVehicleType] = [...newRules[settingsVehicleType], { hours: 0, amount: 0 }];
                    setPricingRules(newRules);
                  }}
                  className="w-full py-5 border-2 border-dashed border-slate-200 rounded-[28px] text-slate-400 text-[10px] font-black tracking-[0.3em] hover:bg-primary/5 hover:border-primary/20 hover:text-primary transition-all group"
                >
                  + Add {settingsVehicleType} rule
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="w-full h-20 bg-primary text-white font-black rounded-[30px] shadow-2xl shadow-primary/30 hover:shadow-primary/50 transition-all text-lg tracking-widest border-t-2 border-white/20"
            >
              Save changes
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-16">
        <div className="flex justify-center mb-10 md:mb-20 animate-in fade-in slide-in-from-top-4 duration-1000">
          <div className="bg-white/80 p-2 rounded-[32px] md:rounded-[40px] backdrop-blur-xl flex flex-col md:flex-row gap-2 md:gap-3 border border-slate-100 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.05)] w-full max-w-sm md:max-w-fit">
            {[
              { id: "entry", icon: PlusCircle, label: "Entry" },
              { id: "exit", icon: LogOut, label: "Exit" },
              { id: "report", icon: FileText, label: "Report" },
              { id: "pass", icon: CreditCard, label: "Passes" }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id as any); setCurrentBill(null); }}
                className={`flex items-center justify-center md:justify-start gap-4 px-6 md:px-10 py-4 md:py-5 rounded-[24px] md:rounded-[32px] transition-all duration-500 font-black text-[10px] md:text-[11px] tracking-[0.2em] relative group overflow-hidden ${activeTab === tab.id
                  ? "bg-primary text-white shadow-xl shadow-primary/25"
                  : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                  }`}
              >
                <tab.icon size={18} className={activeTab === tab.id ? "text-white" : "text-slate-300 group-hover:text-primary transition-colors"} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-[700px] relative">
          {/* Entry Module */}
          {activeTab === "entry" && (
            <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-12 duration-1000">
              <div className="space-y-8">
                {!currentBill ? (
                  <div className="bg-white rounded-[56px] p-16 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.05)] border border-slate-100 relative group overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-2 bg-primary group-hover:h-3 transition-all" />

                    <div className="mb-12">
                      <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter mb-4">Vehicle Entry</h2>
                      <p className="text-primary font-black text-[10px] tracking-[0.5em]">Register a new vehicle entry</p>
                    </div>

                    <form onSubmit={handleEntry} className="space-y-12">
                      {/* Sub-form: Vehicle Type Matrix */}
                      <div className="space-y-6">
                        <label className="text-[10px] font-black text-slate-500 tracking-[0.3em] ml-2">Select vehicle type</label>
                        <div className="grid grid-cols-4 gap-4">
                          {VEHICLE_TYPES.map((v) => (
                            <button
                              key={v.type}
                              type="button"
                              onClick={() => setVehicleType(v.type)}
                              className={`flex flex-col items-center justify-center p-6 rounded-[32px] transition-all duration-500 border-2 ${vehicleType === v.type
                                ? "bg-primary border-primary text-white shadow-xl shadow-primary/30 scale-105"
                                : "bg-slate-50 border-transparent text-slate-400 hover:bg-white hover:border-slate-100 shadow-inner"
                                }`}
                            >
                              <v.icon size={32} strokeWidth={2.5} />
                              <span className="text-[9px] font-black mt-3 tracking-tighter">{v.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4 relative">
                        <div className="flex justify-between items-center ml-2">
                          <label className="text-[10px] font-black text-slate-500 tracking-[0.3em]">Vehicle number</label>
                          {vehicleNumber.length > 2 && (() => {
                            const isActive = sessions.find(s => s.vehicleNumber === vehicleNumber && s.status === "active");
                            if (isActive) {
                              return (
                                <div className="flex items-center gap-2 px-4 py-1.5 rounded-xl border bg-orange-50 border-orange-100 text-orange-600 animate-pulse">
                                  <AlertCircle size={12} />
                                  <span className="text-[9px] font-black tracking-widest uppercase">
                                    This vehicle is already entered
                                  </span>
                                </div>
                              );
                            }

                            const pass = passes.find(p => p.vehicleNumber === vehicleNumber);
                            if (!pass) return null;
                            const isExpired = isBefore(new Date(pass.expiryDate), new Date());
                            return (
                              <div className={`flex items-center gap-2 px-4 py-1.5 rounded-xl border animate-in zoom-in duration-300 ${isExpired ? "bg-red-50 border-red-100 text-red-600" : "bg-green-50 border-green-100 text-green-600"}`}>
                                <CreditCard size={12} />
                                <span className="text-[9px] font-black tracking-widest">
                                  {isExpired ? "Expired member" : "Authorized member"}
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                        <input
                          required
                          placeholder="TN 01 AB 1234"
                          value={vehicleNumber}
                          onChange={(e) => setVehicleNumber(formatVehicleNumber(e.target.value))}
                          className="w-full px-10 py-8 text-4xl font-mono font-black tracking-[0.2em] bg-slate-50/50 border-2 border-slate-100 rounded-[36px] focus:bg-white focus:border-primary focus:ring-[16px] focus:ring-primary/5 transition-all outline-none text-slate-800 placeholder:text-slate-200 shadow-inner"
                        />
                      </div>

                      {/* Rule 3: Free Admission Toggle */}
                      <div className={`p-8 rounded-[40px] border-2 transition-all duration-700 ${isFree ? "bg-green-50 border-green-200 shadow-lg shadow-green-500/5 scale-[1.02]" : "bg-slate-50/50 border-transparent"}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-5">
                            <div className={`p-5 rounded-[28px] transition-all duration-700 ${isFree ? "bg-green-500 text-white shadow-xl shadow-green-500/30 rotate-12" : "bg-slate-100 text-slate-400 grayscale"}`}>
                              <Gift size={32} />
                            </div>
                            <div>
                              <h4 className={`text-xl font-black transition-colors ${isFree ? "text-green-800" : "text-slate-800"}`}>Exempt Ticket</h4>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Free Admission Logic</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setIsFree(!isFree); if (!isFree) setProofImage(null); }}
                            className={`w-20 h-10 rounded-full relative transition-all duration-700 ${isFree ? "bg-green-500" : "bg-slate-200 shadow-inner"}`}
                          >
                            <div className={`absolute top-1 w-8 h-8 bg-white rounded-full shadow-lg transition-all duration-700 ${isFree ? "left-11 shadow-green-900/20" : "left-1"}`} />
                          </button>
                        </div>

                        {/* If Free: Upload Matrix */}
                        {isFree && (
                          <div className="mt-8 space-y-6 pt-8 border-t border-green-200 animate-in slide-in-from-top-4 duration-500">
                            <label className="text-[9px] font-black uppercase text-green-700 tracking-[0.3em] block ml-2">Verification Proof Required</label>
                            <div className="flex gap-4">
                              <label className="flex-1 group cursor-pointer">
                                <div className="h-40 bg-white border-4 border-dashed border-green-100 rounded-[32px] flex flex-col items-center justify-center gap-3 group-hover:border-green-300 group-hover:bg-green-50 transition-all overflow-hidden relative">
                                  {proofImage ? (
                                    <img src={proofImage} className="absolute inset-0 w-full h-full object-cover" />
                                  ) : (
                                    <>
                                      <Upload className="text-green-300 group-hover:scale-110 transition-transform" />
                                      <span className="text-[10px] font-black text-green-300 uppercase">Drop Validation Docs</span>
                                    </>
                                  )}
                                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                </div>
                              </label>
                              {proofImage && (
                                <button type="button" onClick={() => setProofImage(null)} className="px-6 bg-red-50 text-red-500 rounded-[32px] font-black text-[9px] tracking-widest border border-red-100 hover:bg-red-500 hover:text-white transition-all">Clear</button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <button type="submit" className="w-full h-28 bg-primary rounded-[40px] p-2 shadow-2xl shadow-primary/25 active:scale-95 transition-all group overflow-hidden relative">
                        <div className="w-full h-full bg-slate-900/10 rounded-[36px] flex items-center justify-center gap-6 text-white text-2xl font-black tracking-[0.1em] uppercase border-t-2 border-white/20">
                          Finalize Admission <ChevronRight size={32} className="group-hover:translate-x-2 transition-transform" />
                        </div>
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="bg-white rounded-[60px] p-16 shadow-2xl text-center border-b-[12px] border-primary animate-in zoom-in duration-700 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-12 opacity-5 scale-150 rotate-12"><PlusCircle size={300} /></div>

                    <div className="w-28 h-28 bg-green-50 text-green-500 rounded-[40px] flex items-center justify-center mx-auto mb-10 shadow-inner border border-green-100 rotate-12">
                      <CheckCircle2 size={56} strokeWidth={3} />
                    </div>
                    <h2 className="text-5xl font-black text-slate-900 mb-4 tracking-tighter">Entry authorized</h2>
                    <p className="text-slate-400 font-black mb-12 tracking-[0.4em] text-xs">Print entry token</p>

                    <div className="bg-slate-50 p-12 rounded-[56px] w-fit mx-auto border-4 border-dashed border-slate-200 mb-12 shadow-inner">
                      <QRCodeSVG value={currentBill.id} size={280} level="H" includeMargin={false} className="opacity-90 mix-blend-multiply" />
                    </div>

                    <div className="grid grid-cols-2 gap-6 mb-12">
                      <div className="bg-slate-50/50 p-8 rounded-[36px] border border-slate-100 text-left">
                        <p className="text-[10px] font-black text-slate-400 mb-2 tracking-widest">Token ID</p>
                        <p className="text-2xl font-black text-primary font-mono">{currentBill.id}</p>
                      </div>
                      <div className="bg-slate-50/50 p-8 rounded-[36px] border border-slate-100 text-left">
                        <p className="text-[10px] font-black text-slate-400 mb-2 tracking-widest">Entry time</p>
                        <p className="text-2xl font-black text-slate-800">{format(new Date(currentBill.entryTime), "HH:mm")}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => setCurrentBill(null)}
                      className="w-full h-24 bg-primary text-white font-black rounded-[36px] tracking-[0.3em] text-sm hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/25 relative z-10 border-t-2 border-white/20"
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>


            </div>
          )}

          {/* Exit Tab */}
          {activeTab === "exit" && (
            <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-12 duration-1000">
              {!currentBill ? (
                <div className="bg-white rounded-[60px] p-20 shadow-2xl border border-slate-100 relative text-center">
                  <div className="inline-flex p-8 bg-red-50 text-red-500 rounded-[44px] mb-12 border-2 border-red-100 rotate-12 shadow-xl shadow-red-500/5">
                    <LogOut size={64} strokeWidth={2.5} />
                  </div>
                  <h2 className="text-6xl font-black text-slate-900 tracking-tighter mb-4">Vehicle exit</h2>
                  <p className="text-slate-400 font-black text-xs tracking-[0.8em] mb-16">Process vehicle settlement</p>

                  <div className="max-w-2xl mx-auto space-y-12">
                    <div className="relative group">
                      <div className="absolute -inset-1 bg-gradient-to-r from-red-600 to-primary rounded-[40px] blur opacity-5 group-hover:opacity-10 transition-opacity" />
                      <Search className="absolute left-10 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-red-500 transition-colors" size={40} />
                      <input
                        placeholder="Enter plate number..."
                        value={exitId}
                        onChange={(e) => setExitId(formatVehicleNumber(e.target.value))}
                        className="w-full h-28 pl-28 pr-40 text-3xl font-mono font-black tracking-[0.2em] bg-white border-4 border-slate-100 rounded-[40px] focus:border-red-600 outline-none transition-all shadow-lg text-slate-800 placeholder:text-slate-300 z-10 relative"
                      />
                      <button
                        onClick={() => setShowScanner(true)}
                        className="absolute right-6 top-1/2 -translate-y-1/2 z-20 w-24 h-16 bg-slate-900 text-white rounded-[24px] flex flex-col items-center justify-center gap-1 hover:bg-slate-800 active:scale-95 transition-all shadow-lg"
                      >
                        <Camera size={24} />
                        <span className="text-[8px] font-black uppercase tracking-tighter">Scan</span>
                      </button>

                      {/* Smart Suggestions Panel */}
                      {exitId.length > 0 && sessions.filter(s => s.status === "active" && (s.vehicleNumber.includes(exitId) || s.id.includes(exitId))).length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-4 bg-white rounded-[40px] border border-slate-100 shadow-2xl z-[100] overflow-hidden divide-y divide-slate-50 animate-in slide-in-from-top-4 duration-300">
                          {sessions
                            .filter(s => s.status === "active" && (s.vehicleNumber.includes(exitId) || s.id.includes(exitId)))
                            .slice(0, 3)
                            .map((s) => (
                              <button
                                key={s.id}
                                onClick={() => { setExitId(s.vehicleNumber); handleExit(s.vehicleNumber); }}
                                className="w-full p-8 hover:bg-slate-50 flex items-center justify-between text-left group transition-all"
                              >
                                <div className="flex items-center gap-6">
                                  <div className="p-4 bg-red-50 text-red-500 rounded-[20px] group-hover:scale-110 group-hover:bg-red-500 group-hover:text-white transition-all duration-300">
                                    {VEHICLE_TYPES.find(v => v.type === s.vehicleType)?.icon && React.createElement(VEHICLE_TYPES.find(v => v.type === s.vehicleType)!.icon, { size: 24 })}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-3">
                                      <p className="text-2xl font-black text-slate-800 tracking-wider transition-colors">{s.vehicleNumber}</p>
                                      {s.isFree && <span className="px-3 py-1 bg-green-500 text-white rounded-lg text-[8px] font-black uppercase tracking-widest">Exempt</span>}
                                    </div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{s.id} • Active for {differenceInMinutes(new Date(), new Date(s.entryTime))}m</p>
                                  </div>
                                </div>
                                <ArrowRight className="text-slate-300 group-hover:text-red-500 group-hover:translate-x-3 transition-all duration-500" size={32} />
                              </button>
                            ))}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleExit(exitId)}
                      disabled={!exitId}
                      className="w-full h-28 bg-red-600 rounded-[40px] p-2 shadow-2xl shadow-red-600/30 active:scale-95 transition-all disabled:opacity-20 disabled:grayscale disabled:scale-100 group overflow-hidden relative"
                    >
                      <div className="w-full h-full bg-slate-900/10 rounded-[34px] flex items-center justify-center gap-6 text-white text-2xl font-black tracking-[0.2em] border-t-2 border-white/20">
                        Authorize settlement <QrCode size={32} />
                      </div>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="max-w-2xl mx-auto animate-in zoom-in-95 duration-700">
                  <div className="bg-white rounded-[64px] shadow-[0_50px_100px_-30px_rgba(0,0,0,0.15)] overflow-hidden border border-slate-100 flex flex-col scale-105">
                    <div className="bg-slate-50 p-10 md:p-16 text-slate-900 relative border-b border-slate-100">
                      <div className="absolute top-0 right-0 p-16 opacity-5 scale-150 rotate-12">
                        {VEHICLE_TYPES.find(v => v.type === currentBill.vehicleType)?.icon ? React.createElement(VEHICLE_TYPES.find(v => v.type === currentBill.vehicleType)!.icon, { size: 200 }) : <Car size={200} />}
                      </div>
                      <div className="relative z-10 flex flex-col md:flex-row justify-between items-start gap-8 md:gap-0">
                        <div>
                          <div className="flex items-center gap-4 mb-4">
                            <span className="text-[10px] font-black tracking-[0.4em] text-primary">Service invoice</span>
                            {currentBill.isFree && <span className="px-4 py-1.5 bg-green-500 text-white rounded-xl text-[9px] font-black tracking-widest shadow-lg shadow-green-500/20">Exempted vehicle</span>}
                          </div>
                          <h4 className="text-4xl md:text-6xl font-black mb-4 tracking-tighter text-slate-900">{currentBill.id}</h4>
                          <p className="text-slate-400 font-black tracking-widest text-[10px] md:text-sm">Verified entry cycle</p>
                        </div>
                        <div className="bg-green-500 p-5 md:p-6 rounded-[24px] md:rounded-[32px] shadow-2xl shadow-green-500/30 border-b-4 border-black/10 self-center md:rotate-12 transition-transform hover:rotate-0">
                          <CheckCircle2 className="text-white" size={48} strokeWidth={3} />
                        </div>
                      </div>
                    </div>

                    <div className="p-16 space-y-10 bg-white">
                      <div className="flex justify-between items-center pb-8 border-b-2 border-slate-50">
                        <span className="text-xs font-black text-slate-400 tracking-widest">Vehicle number</span>
                        <span className="text-4xl font-black text-slate-900 font-mono tracking-widest">{currentBill.vehicleNumber}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-12">
                        <div className="p-8 bg-slate-50/50 rounded-[40px] border border-slate-100">
                          <p className="text-[11px] font-black text-slate-400 tracking-widest mb-4 flex items-center gap-2"><Timer size={14} /> Entry time</p>
                          <p className="text-3xl font-black text-slate-800">{format(new Date(currentBill.entryTime), "HH:mm:ss")}</p>
                          <p className="text-[10px] text-slate-400 font-bold mt-2 uppercase">{format(new Date(currentBill.entryTime), "dd MMM yyyy")}</p>
                        </div>
                        <div className="p-8 bg-slate-50/50 rounded-[40px] border border-slate-100 text-right">
                          <p className="text-[11px] font-black text-slate-400 tracking-widest mb-4 flex justify-end items-center gap-2">Exit time <LogOut size={14} /></p>
                          <p className="text-3xl font-black text-slate-800">{format(new Date(currentBill.exitTime!), "HH:mm:ss")}</p>
                          <p className="text-[10px] text-slate-400 font-bold mt-2 uppercase">{format(new Date(currentBill.exitTime!), "dd MMM yyyy")}</p>
                        </div>
                      </div>

                      <div className="flex flex-col md:flex-row justify-between items-center py-8 md:py-10 px-6 md:px-10 bg-slate-50 text-slate-900 rounded-[32px] md:rounded-[40px] shadow-inner border border-slate-100 gap-8 md:gap-0">
                        <div className="flex items-center gap-5 w-full md:w-auto">
                          <div className="p-4 bg-primary/10 rounded-2xl"><Clock size={24} className="text-primary" /></div>
                          <div>
                            <p className="text-[10px] font-black text-slate-400 tracking-widest">Calculated duration</p>
                            <p className="text-xl md:text-2xl font-black">{Math.max(1, Math.ceil(currentBill.durationMinutes! / 60))} Billable hours</p>
                          </div>
                        </div>
                        <div className="text-center md:text-right w-full md:w-auto border-t md:border-t-0 md:border-l border-slate-200 pt-6 md:pt-0 md:pl-8">
                          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Net Payable</p>
                          <p className="text-4xl md:text-5xl font-black text-slate-900 flex items-center justify-center md:justify-end gap-2">₹{currentBill.amount}<span className="text-xl text-primary">*</span></p>
                        </div>
                      </div>

                      {/* Proof Display on Exit for verification */}
                      {currentBill.isFree && currentBill.proofImage && (
                        <div className="p-8 bg-green-50 rounded-[40px] border-2 border-dashed border-green-200">
                          <p className="text-[10px] font-black uppercase text-green-700 tracking-widest mb-4 flex items-center gap-2"><ImageIcon size={14} /> Exemption Proof Verified</p>
                          <div className="h-40 w-full overflow-hidden rounded-3xl border-2 border-white shadow-lg">
                            <img src={currentBill.proofImage} className="w-full h-full object-cover" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setCurrentBill(null)}
                    className="w-full mt-12 h-24 bg-primary text-white font-black rounded-[40px] shadow-[0_30px_60px_-15px_rgba(59,130,246,0.3)] hover:scale-105 active:scale-95 transition-all tracking-[0.5em] text-sm border-t-2 border-white/20"
                  >
                    Print invoice
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Report Module */}
          {activeTab === "report" && (
            <div className="max-w-7xl mx-auto space-y-16 animate-in fade-in slide-in-from-bottom-12 duration-1000">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                {[
                  { label: "Active vehicles", val: sessions.filter(s => s.status === "active").length, icon: Car, color: "text-blue-600", bg: "bg-blue-50" },
                  { label: "Total throughput", val: sessions.length, icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50" },
                  { label: "Free entries", val: sessions.filter(s => s.isFree).length, icon: Gift, color: "text-orange-600", bg: "bg-orange-50" },
                  { label: "Total yield", val: `₹${sessions.reduce((acc, curr) => acc + (curr.amount || 0), 0)}`, icon: ShieldCheck, color: "text-green-600", bg: "bg-green-50" }
                ].map((stat, i) => (
                  <div key={i} className="bg-white p-12 rounded-[48px] shadow-2xl shadow-slate-200/40 border border-slate-50 relative overflow-hidden group hover:scale-[1.02] transition-all">
                    <div className={`absolute top-0 right-0 p-10 opacity-10 group-hover:scale-125 transition-transform duration-700 ${stat.color}`}>
                      <stat.icon size={80} strokeWidth={2.5} />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 tracking-[0.4em] mb-6">{stat.label}</p>
                    <h3 className={`text-5xl font-black ${stat.color} tracking-tighter`}>{stat.val}</h3>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-[64px] shadow-[0_50px_100px_-30px_rgba(0,0,0,0.05)] border border-slate-50 overflow-hidden">
                <div className="p-12 flex justify-between items-center border-b border-slate-50 bg-slate-50/20">
                  <div>
                    <h3 className="text-3xl font-black text-slate-900 tracking-tighter">Operational Stream</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.4em] mt-1">Real-time Data Processing</p>
                  </div>
                  <button
                    onClick={async () => {
                      if (confirm("Initiate Data Purge? All your records will be deleted.")) {
                        const userId = getUserId();
                        if (!userId) {
                          alert("Authentication error: Please login again");
                          router.push('/login');
                          return;
                        }

                        const { error } = await supabase.from("parking_sessions").delete().eq("user_id", userId);
                        if (!error) {
                          setSessions([]);
                          alert("All your parking records have been deleted.");
                        } else {
                          alert("Failed to purge data");
                          console.error("Database error:", error);
                        }
                      }
                    }}
                    className="px-8 py-3.5 bg-red-50 text-red-500 text-[11px] font-black uppercase tracking-widest rounded-[20px] hover:bg-red-500 hover:text-white transition-all border border-red-100 shadow-xl shadow-red-500/5 group"
                  >
                    Format Matrix <AlertCircle size={16} className="inline ml-2 group-hover:rotate-12 transition-transform" />
                  </button>
                </div>
                {/* Desktop View Table */}
                <div className="hidden lg:block overflow-x-auto p-4">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/10 rounded-2xl">
                        <th className="px-10 py-8 text-[11px] font-black text-slate-400 tracking-widest">Token ID</th>
                        <th className="px-10 py-8 text-[11px] font-black text-slate-400 tracking-widest">Type</th>
                        <th className="px-10 py-8 text-[11px] font-black text-slate-400 tracking-widest text-center">Vehicle number</th>
                        <th className="px-10 py-8 text-[11px] font-black text-slate-400 tracking-widest">Entry time</th>
                        <th className="px-10 py-8 text-[11px] font-black text-slate-400 tracking-widest">Exit time</th>
                        <th className="px-10 py-8 text-[11px] font-black text-slate-400 tracking-widest text-center">Status</th>
                        <th className="px-10 py-8 text-[11px] font-black text-slate-400 tracking-widest text-right">Settlement</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {sessions.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/80 transition-all group border-b border-slate-50 last:border-0">
                          <td className="px-10 py-10">
                            <div className="flex flex-col">
                              <span className="font-mono font-black text-primary text-base mb-1">{s.id}</span>
                              <span className="text-[9px] font-black text-slate-300">System identifier</span>
                            </div>
                          </td>
                          <td className="px-10 py-10">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border ${s.status === "active" ? "bg-blue-50 text-primary border-blue-100" : "bg-slate-100 text-slate-400 border-slate-200"}`}>
                              {VEHICLE_TYPES.find(v => v.type === s.vehicleType)?.icon ? React.createElement(VEHICLE_TYPES.find(v => v.type === s.vehicleType)!.icon, { size: 24 }) : <Car size={24} />}
                            </div>
                          </td>
                          <td className="px-10 py-10">
                            <div className="flex flex-col items-center">
                              <span className="font-black text-slate-800 tracking-[0.2em] text-lg uppercase">{s.vehicleNumber}</span>
                              <span className="text-[9px] font-black text-slate-400 tracking-tighter mt-1">{s.vehicleType} segment</span>
                            </div>
                          </td>
                          <td className="px-10 py-10">
                            <div className="flex flex-col">
                              <span className="text-base font-black text-slate-700">{format(new Date(s.entryTime), "HH:mm")}</span>
                              <span className="text-[10px] font-bold text-slate-300 uppercase">{format(new Date(s.entryTime), "dd MMM")}</span>
                            </div>
                          </td>
                          <td className="px-10 py-10">
                            {s.exitTime ? (
                              <div className="flex flex-col">
                                <span className="text-base font-black text-slate-700">{format(new Date(s.exitTime), "HH:mm")}</span>
                                <span className="text-[10px] font-bold text-slate-300 uppercase">{format(new Date(s.exitTime), "dd MMM")}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-primary rounded-full animate-ping" />
                                <span className="text-xs font-black text-primary uppercase tracking-widest">Live Node</span>
                              </div>
                            )}
                          </td>
                          <td className="px-10 py-10 text-center">
                            {s.isFree ? (
                              <div className="flex flex-col items-center gap-2 group/proof">
                                <span className="px-4 py-2 bg-green-500 text-white rounded-xl text-[10px] font-black tracking-widest shadow-lg shadow-green-500/20">Exempt</span>
                                {s.proofImage && (
                                  <div className="relative">
                                    <ImageIcon size={14} className="text-green-500" />
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 hidden group-hover/proof:block w-48 h-48 bg-white p-2 rounded-2xl shadow-2xl border-4 border-white z-50 animate-in zoom-in">
                                      <img src={s.proofImage} className="w-full h-full object-cover rounded-xl" />
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="px-4 py-2 bg-slate-100 text-slate-400 rounded-xl text-[10px] font-black tracking-widest border border-slate-200">Standard</span>
                            )}
                          </td>
                          <td className="px-10 py-10 text-right">
                            <div className="flex flex-col items-end">
                              <span className={`text-2xl font-black ${s.amount === 0 && s.isFree ? "text-green-600" : "text-slate-900"}`}>
                                {s.amount !== undefined ? `₹${s.amount}` : "Pending"}
                              </span>
                              {s.durationMinutes && <span className="text-[10px] font-black text-slate-300 mt-1">{Math.ceil(s.durationMinutes / 60)} Unit billable</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View Cards */}
                <div className="lg:hidden p-6 space-y-6">
                  {sessions.map((s) => (
                    <div key={s.id} className="bg-slate-50 rounded-[32px] p-6 border border-slate-100 space-y-6">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-2xl ${s.status === "active" ? "bg-primary text-white" : "bg-slate-200 text-slate-400"}`}>
                            {VEHICLE_TYPES.find(v => v.type === s.vehicleType)?.icon && React.createElement(VEHICLE_TYPES.find(v => v.type === s.vehicleType)!.icon, { size: 20 })}
                          </div>
                          <div>
                            <p className="font-mono font-black text-primary text-xs">{s.id}</p>
                            <h4 className="text-lg font-black text-slate-900 uppercase tracking-widest">{s.vehicleNumber}</h4>
                          </div>
                        </div>
                        {s.isFree ? (
                          <span className="px-3 py-1 bg-green-500 text-white rounded-lg text-[8px] font-black uppercase tracking-widest">Exempt</span>
                        ) : (
                          <span className="px-3 py-1 bg-slate-200 text-slate-500 rounded-lg text-[8px] font-black uppercase tracking-widest">Standard</span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200/50">
                        <div>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Check-In</p>
                          <p className="text-sm font-black text-slate-700">{format(new Date(s.entryTime), "HH:mm")}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Check-Out</p>
                          <p className="text-sm font-black text-slate-700">{s.exitTime ? format(new Date(s.exitTime), "HH:mm") : "---"}</p>
                        </div>
                      </div>

                      <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Settlement</span>
                        <span className={`text-xl font-black ${s.amount === 0 && s.isFree ? "text-green-600" : "text-slate-900"}`}>
                          {s.amount !== undefined ? `₹${s.amount}` : "PENDING"}
                        </span>
                      </div>

                      {s.isFree && s.proofImage && (
                        <div className="pt-2">
                          <p className="text-[8px] font-black text-green-600 uppercase tracking-widest mb-2">Verification Proof</p>
                          <img src={s.proofImage} className="w-full h-32 object-cover rounded-2xl border-2 border-white shadow-sm" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {sessions.length === 0 && (
                  <div className="px-10 py-40 text-center">
                    <div className="flex flex-col items-center opacity-10">
                      <Search size={120} className="mb-8" />
                      <p className="text-4xl font-black uppercase tracking-[0.2em]">Zero Data Flow</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Membership Pass Module */}
          {activeTab === "pass" && (
            <div className="max-w-7xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-12 duration-1000">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                {/* Create Pass Card */}
                <div className="lg:col-span-1">
                  <div className="bg-white rounded-[44px] p-10 border border-slate-100 shadow-xl lg:sticky lg:top-32">
                    <div className="mb-10 text-center lg:text-left">
                      <h3 className="text-3xl font-black text-slate-900 tracking-tighter">Create pass</h3>
                      <p className="text-[10px] text-primary font-bold tracking-[0.4em] mt-1">Setup monthly memberships</p>
                    </div>

                    <form onSubmit={createMembership} className="space-y-6">
                      <div>
                        <p className="text-[9px] font-black text-slate-400 tracking-widest mb-3 ml-1">Holder name</p>
                        <div className="relative group">
                          <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={18} />
                          <input
                            required
                            placeholder="Full name"
                            value={passForm.holderName}
                            onChange={(e) => setPassForm({ ...passForm, holderName: e.target.value.toUpperCase() })}
                            className="w-full bg-slate-50 border-2 border-transparent focus:border-primary/20 rounded-2xl pl-14 pr-6 py-4 font-black outline-none transition-all placeholder:text-slate-300"
                          />
                        </div>
                      </div>

                      <div>
                        <p className="text-[9px] font-black text-slate-400 tracking-widest mb-3 ml-1">Plate number</p>
                        <input
                          required
                          placeholder="Vehicle number"
                          value={passForm.vehicleNumber}
                          onChange={(e) => setPassForm({ ...passForm, vehicleNumber: formatVehicleNumber(e.target.value) })}
                          className="w-full bg-slate-50 border-2 border-transparent focus:border-primary/20 rounded-2xl px-6 py-4 font-black outline-none transition-all placeholder:text-slate-300"
                        />
                      </div>

                      <div>
                        <p className="text-[9px] font-black text-slate-400 tracking-widest mb-3 ml-1">Vehicle type</p>
                        <div className="grid grid-cols-4 gap-3">
                          {VEHICLE_TYPES.map((v) => (
                            <button
                              key={v.type}
                              type="button"
                              onClick={() => setPassForm({ ...passForm, vehicleType: v.type })}
                              className={`p-4 rounded-xl flex items-center justify-center transition-all ${passForm.vehicleType === v.type ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-slate-50 text-slate-400 hover:bg-slate-100"}`}
                            >
                              <v.icon size={20} />
                            </button>
                          ))}
                        </div>
                      </div>

                      <button type="submit" className="w-full h-20 bg-primary text-white font-black rounded-[24px] tracking-widest text-xs shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all mt-4 border-t-2 border-white/10">
                        Create pass
                      </button>
                    </form>
                  </div>
                </div>

                {/* Pass Records */}
                <div className="lg:col-span-2 space-y-8">
                  <div className="flex flex-col md:flex-row items-center justify-between px-6 gap-6 md:gap-0">
                    <div className="text-center md:text-left">
                      <h3 className="text-3xl font-black text-slate-900 tracking-tighter">Active passes</h3>
                      <p className="text-[10px] text-slate-400 font-bold tracking-[0.4em] mt-1">List of authorized members</p>
                    </div>
                    <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center text-green-500 font-black border border-green-100">{passes.length}</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {passes.map((pass) => {
                      const isExpired = isBefore(new Date(pass.expiryDate), new Date());
                      return (
                        <div key={pass.id} className="bg-white rounded-[40px] p-8 border border-slate-100 shadow-lg group hover:border-primary/20 transition-all relative overflow-hidden">
                          <div className={`absolute top-0 right-0 w-32 h-32 opacity-[0.03] -mr-10 -mt-10 group-hover:scale-150 transition-transform duration-1000 ${isExpired ? "text-red-600" : "text-primary"}`}>
                            {VEHICLE_TYPES.find(v => v.type === pass.vehicleType)?.icon && React.createElement(VEHICLE_TYPES.find(v => v.type === pass.vehicleType)!.icon, { size: 120 })}
                          </div>

                          <div className="flex justify-between items-start mb-6">
                            <div className={`p-4 rounded-2xl ${isExpired ? "bg-red-50 text-red-500" : "bg-primary text-white shadow-lg shadow-primary/20"}`}>
                              <CreditCard size={24} />
                            </div>
                            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest ${isExpired ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}>
                              {isExpired ? "Subscription halted" : "Active node"}
                            </span>
                          </div>

                          <div className="space-y-4 mb-8">
                            <div>
                              <p className="text-[9px] font-black text-slate-400 tracking-[0.2em] mb-1">Pass ID</p>
                              <p className="text-xl font-black text-slate-800 font-mono tracking-wider">{pass.id}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-black text-slate-400 tracking-[0.2em] mb-1">Holder identity</p>
                              <p className="text-sm font-black text-slate-700">{pass.holderName} • {pass.vehicleNumber}</p>
                            </div>
                            <div className="flex items-center gap-2 pt-2 text-slate-400">
                              <Calendar size={14} />
                              <p className="text-[10px] font-black tracking-widest">Valid until: {format(new Date(pass.expiryDate), "dd MMM yyyy")}</p>
                            </div>
                          </div>

                          <button
                            onClick={() => rechargePass(pass.id)}
                            className={`w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-black text-[10px] tracking-[0.3em] transition-all border-2 ${isExpired ? "bg-red-600 text-white border-red-600 shadow-xl shadow-red-500/20" : "bg-white text-slate-400 border-slate-100 hover:border-primary hover:text-primary"}`}
                          >
                            <RefreshCw size={16} className={isExpired ? "animate-spin" : ""} />
                            Recharge membership
                          </button>
                        </div>
                      )
                    })}
                    {passes.length === 0 && (
                      <div className="col-span-full py-24 text-center bg-slate-50 rounded-[44px] border-2 border-dashed border-slate-200">
                        <CreditCard size={80} className="mx-auto text-slate-200 mb-6" />
                        <p className="text-slate-400 font-black tracking-widest text-xs">No active memberships found</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="pb-24 text-center opacity-40">
        <div className="inline-flex flex-col items-center gap-4">
          <div className="flex items-center gap-6 saturate-0 opacity-50">
            <Car size={24} /> <Bike size={24} /> <Truck size={24} /> <Bus size={24} />
          </div>
          <p className="text-[10px] font-black tracking-[1em] text-slate-500 bg-slate-100 px-10 py-4 rounded-full border border-slate-200">
            Smart Parking System v3.0 • Premium Build
          </p>
        </div>
      </footer>
    </div>
  );
}
