import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  Globe2, ArrowRight, ShieldCheck, Zap, Clock, 
  CheckCircle2, Building2, Users, LayoutDashboard,
  Menu, X, Sparkles
} from 'lucide-react';

export const LandingPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'CLIENT' | 'INTERPRETER'>('CLIENT');

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-white font-sans selection:bg-blue-100 text-gray-900">
      
      {/* --- NAVBAR --- */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <div className="flex items-center cursor-pointer" onClick={() => window.scrollTo(0,0)}>
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white mr-3 shadow-lg shadow-blue-200">
                <Globe2 size={24} />
              </div>
              <span className="text-xl font-bold tracking-tight text-gray-900">Lingland</span>
            </div>

            {/* Desktop Links */}
            <div className="hidden md:flex space-x-8 items-center">
              <button onClick={() => scrollToSection('features')} className="text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors">Why Us</button>
              <button onClick={() => scrollToSection('interpreters')} className="text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors">Join as Interpreter</button>
              
              {user ? (
                <Link 
                  to={user.role === 'ADMIN' ? '/admin/dashboard' : user.role === 'CLIENT' ? '/client/dashboard' : '/interpreter/dashboard'}
                  className="px-6 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-full hover:bg-gray-800 transition-all flex items-center shadow-lg shadow-gray-200"
                >
                  <LayoutDashboard size={16} className="mr-2" />
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/login" className="text-sm font-bold text-gray-900 hover:text-blue-600">
                    Log in
                  </Link>
                  <Link 
                    to="/request" 
                    className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-full hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 hover:shadow-blue-300 transform hover:-translate-y-0.5"
                  >
                    Book Interpreter
                  </Link>
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden">
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-gray-600">
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* --- HERO SECTION --- */}
      <section className="pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden relative">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-[600px] h-[600px] bg-blue-50 rounded-full blur-3xl opacity-50 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            <div className="max-w-2xl">
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wide mb-6 border border-blue-100">
                <Zap size={14} className="mr-1.5" />
                Human Connection, Tech Speed
              </div>
              <h1 className="text-5xl lg:text-7xl font-extrabold text-gray-900 tracking-tight leading-[1.1] mb-6">
                Bridging barriers with<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">expert voices.</span>
              </h1>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed max-w-lg">
                Access the UK's most reliable network of verified interpreters. 
                From instant booking to automated billing, we've streamlined the entire process.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Link 
                  to="/request"
                  className="inline-flex justify-center items-center px-8 py-4 bg-blue-600 text-white font-bold rounded-full hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 hover:shadow-blue-300 transform hover:-translate-y-1 text-lg"
                >
                  Book as Guest
                  <ArrowRight size={20} className="ml-2" />
                </Link>
                <Link 
                  to="/login"
                  className="inline-flex justify-center items-center px-8 py-4 bg-white text-gray-900 border border-gray-200 font-bold rounded-full hover:bg-gray-50 transition-all"
                >
                  Partner Login
                </Link>
              </div>
            </div>

            <div className="relative hidden lg:block">
              <div className="relative z-10 bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl shadow-2xl p-6 transform rotate-[-2deg] hover:rotate-0 transition-transform duration-500 max-w-md mx-auto">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                      <CheckCircle2 size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">Booking Confirmed</p>
                      <p className="text-xs text-gray-500">Instant Matching</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 mb-6">
                  <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm flex items-center">
                    <Globe2 className="text-blue-500 mr-3" size={18} />
                    <p className="text-sm font-semibold text-gray-800">English &rarr; Polish</p>
                  </div>
                </div>
                <div className="flex items-center p-3 bg-gray-50 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-blue-200 mr-3"></div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900">Verified Expert</p>
                    <p className="text-xs text-gray-500">Qualified & DBS Checked</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- JOIN US SECTION (NEW) --- */}
      <section id="interpreters" className="py-24 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <div className="relative bg-gradient-to-br from-blue-900 to-indigo-950 rounded-[2.5rem] p-8 md:p-16 overflow-hidden shadow-2xl">
              {/* Abstract decoration */}
              <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
              
              <div className="grid lg:grid-cols-2 gap-12 items-center relative z-10">
                <div>
                   <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-blue-500/20 text-blue-300 text-xs font-black uppercase tracking-widest mb-6 border border-blue-500/30">
                     <Sparkles size={14} className="mr-2" />
                     Work with Lingland
                   </div>
                   <h2 className="text-4xl md:text-5xl font-extrabold text-white leading-tight mb-6">
                     Transform your fluency into <br/>
                     <span className="text-blue-400">new opportunities.</span>
                   </h2>
                   <p className="text-blue-100/70 text-lg mb-8 leading-relaxed max-w-lg">
                     Join the UK's most advanced interpreting network. Enjoy seamless digital management, rapid payments, and complete flexibility over your schedule.
                   </p>
                   
                   <div className="space-y-4 mb-10">
                      {[
                        "Get paid weekly directly to your bank account",
                        "Accept jobs with one tap from your phone",
                        "Zero paperwork with our digital timesheets",
                        "Dedicated support and professional growth"
                      ].map((feature, i) => (
                        <div key={i} className="flex items-center text-white font-medium">
                           <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                             <Check size={14} />
                           </div>
                           {feature}
                        </div>
                      ))}
                   </div>

                   <Link 
                     to="/apply"
                     className="inline-flex items-center px-10 py-5 bg-white text-blue-900 font-black rounded-2xl hover:bg-blue-50 transition-all shadow-xl shadow-black/20 transform hover:scale-105 group"
                   >
                     Apply to Join Now
                     <ArrowRight size={20} className="ml-3 group-hover:translate-x-1 transition-transform" />
                   </Link>
                </div>

                <div className="hidden lg:grid grid-cols-2 gap-4">
                   <div className="space-y-4 mt-12">
                      <div className="bg-white/10 backdrop-blur-md p-6 rounded-3xl border border-white/10 transform -rotate-3">
                         <h4 className="text-white font-bold mb-1">Weekly Pay</h4>
                         <p className="text-blue-100/60 text-xs">Automated invoicing for all completed jobs.</p>
                      </div>
                      <div className="bg-white/10 backdrop-blur-md p-6 rounded-3xl border border-white/10">
                         <h4 className="text-white font-bold mb-1">Flexibility</h4>
                         <p className="text-blue-100/60 text-xs">Work when you want, where you want.</p>
                      </div>
                   </div>
                   <div className="space-y-4">
                      <div className="bg-blue-600 p-6 rounded-3xl shadow-xl">
                         <h4 className="text-white font-bold mb-1">500+ Experts</h4>
                         <p className="text-blue-100 text-xs">Join a growing community of professionals.</p>
                      </div>
                      <div className="bg-white/10 backdrop-blur-md p-6 rounded-3xl border border-white/10 transform rotate-3">
                         <h4 className="text-white font-bold mb-1">Mobile Native</h4>
                         <p className="text-blue-100/60 text-xs">Manage everything from your smartphone.</p>
                      </div>
                   </div>
                </div>
              </div>
           </div>
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="bg-white border-t border-gray-100 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white mr-2">
                  <Globe2 size={18} />
                </div>
                <span className="text-xl font-bold text-gray-900">Lingland</span>
              </div>
              <p className="text-gray-500 text-sm max-w-xs">
                Bridging language barriers with technology and trust.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-gray-900 mb-4">Join Us</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><Link to="/apply" className="hover:text-blue-600">Apply as Interpreter</Link></li>
                <li><Link to="/login" className="hover:text-blue-600">Staff Portal</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center text-xs text-gray-400">
            <p>© 2024 Lingland Ltd. All rights reserved.</p>
            <div className="flex space-x-4 mt-4 md:mt-0 uppercase font-black">
              <span>ISO 9001</span>
              <span>GDPR Compliant</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

const Check = ({ size, className }: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="20 6 9 17 4 12" /></svg>
);