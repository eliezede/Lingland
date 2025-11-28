
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  Globe2, ArrowRight, ShieldCheck, Zap, Clock, 
  CheckCircle2, Building2, Users, LayoutDashboard,
  Menu, X
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
              <button onClick={() => scrollToSection('how-it-works')} className="text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors">How it Works</button>
              
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

        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-gray-100 absolute w-full px-4 py-6 space-y-4 shadow-xl">
            <button onClick={() => scrollToSection('features')} className="block text-base font-medium text-gray-600 w-full text-left">Why Us</button>
            <button onClick={() => scrollToSection('how-it-works')} className="block text-base font-medium text-gray-600 w-full text-left">How it Works</button>
            <div className="pt-4 border-t border-gray-100 space-y-3">
              <Link to="/login" className="block w-full py-3 text-center text-gray-900 font-bold border border-gray-200 rounded-xl">
                Log in
              </Link>
              <Link to="/request" className="block w-full py-3 text-center bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200">
                Book Interpreter
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* --- HERO SECTION --- */}
      <section className="pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden relative">
        {/* Background Elements */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-[600px] h-[600px] bg-blue-50 rounded-full blur-3xl opacity-50 pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-[400px] h-[400px] bg-purple-50 rounded-full blur-3xl opacity-50 pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            
            {/* Left Content */}
            <div className="max-w-2xl">
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wide mb-6 border border-blue-100">
                <Zap size={14} className="mr-1.5" />
                New Platform Live
              </div>
              <h1 className="text-5xl lg:text-7xl font-extrabold text-gray-900 tracking-tight leading-[1.1] mb-6">
                Human connection,<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">tech speed.</span>
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
              
              <div className="mt-10 flex items-center text-sm text-gray-500">
                <div className="flex -space-x-2 mr-4">
                  {[1,2,3,4].map(i => (
                    <div key={i} className={`w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-[10px] font-bold overflow-hidden bg-cover`} style={{backgroundImage: `url(https://i.pravatar.cc/100?img=${i+10})`}} />
                  ))}
                </div>
                <p>Trusted by 500+ professionals</p>
              </div>
            </div>

            {/* Right Visual (3D Mockup Simulation) */}
            <div className="relative hidden lg:block">
              {/* Glassmorphism Card */}
              <div className="relative z-10 bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl shadow-2xl p-6 transform rotate-[-2deg] hover:rotate-0 transition-transform duration-500 max-w-md mx-auto">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                      <CheckCircle2 size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">Booking Confirmed</p>
                      <p className="text-xs text-gray-500">Just now</p>
                    </div>
                  </div>
                  <span className="bg-green-50 text-green-700 text-xs font-bold px-2 py-1 rounded">REF: LL-829</span>
                </div>
                
                <div className="space-y-3 mb-6">
                  <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm flex items-center">
                    <Globe2 className="text-blue-500 mr-3" size={18} />
                    <div>
                      <p className="text-xs text-gray-400 font-bold uppercase">Language</p>
                      <p className="text-sm font-semibold text-gray-800">English &rarr; Arabic</p>
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm flex items-center">
                    <Clock className="text-purple-500 mr-3" size={18} />
                    <div>
                      <p className="text-xs text-gray-400 font-bold uppercase">Time</p>
                      <p className="text-sm font-semibold text-gray-800">Tomorrow, 10:00 AM</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center p-3 bg-gray-50 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-gray-300 mr-3 bg-cover" style={{backgroundImage: 'url(https://i.pravatar.cc/100?img=33)'}}></div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900">Sarah J.</p>
                    <p className="text-xs text-gray-500">Verified Interpreter • 5.0 ★</p>
                  </div>
                  <button className="bg-black text-white text-xs font-bold px-3 py-1.5 rounded-lg">View</button>
                </div>
              </div>

              {/* Decorative Elements behind */}
              <div className="absolute top-10 -right-10 w-40 h-40 bg-blue-400 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
              <div className="absolute -bottom-10 left-10 w-40 h-40 bg-purple-400 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000" />
            </div>

          </div>
        </div>
      </section>

      {/* --- BENTO GRID FEATURES --- */}
      <section id="features" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Why Lingland?</h2>
            <p className="text-gray-500 text-lg">We've rebuilt the interpreting experience from the ground up to be faster, transparent, and fair.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: Speed */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl transition-shadow duration-300 group">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 mb-6 group-hover:scale-110 transition-transform">
                <Zap size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Instant Requests</h3>
              <p className="text-gray-500 leading-relaxed">
                Book in seconds without logging in. Our "Guest Booking" feature lets you request support immediately.
              </p>
            </div>

            {/* Card 2: Compliance */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl transition-shadow duration-300 group">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 mb-6 group-hover:scale-110 transition-transform">
                <ShieldCheck size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Verified & Compliant</h3>
              <p className="text-gray-500 leading-relaxed">
                Every interpreter is DBS checked and qualified. We handle the compliance so you don't have to.
              </p>
            </div>

            {/* Card 3: Billing */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl transition-shadow duration-300 group">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-green-600 mb-6 group-hover:scale-110 transition-transform">
                <Clock size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Smart Billing</h3>
              <p className="text-gray-500 leading-relaxed">
                Digital timesheets, automated invoicing, and real-time cost tracking for transparent finance.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* --- SEGMENTATION --- */}
      <section id="how-it-works" className="py-24 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gray-900 rounded-3xl p-8 md:p-16 relative overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '32px 32px'}}></div>

            <div className="relative z-10 text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-8">Tailored for your role</h2>
              
              {/* Custom Toggle */}
              <div className="inline-flex bg-gray-800 p-1 rounded-full mb-12">
                <button 
                  onClick={() => setActiveTab('CLIENT')}
                  className={`px-8 py-3 rounded-full text-sm font-bold transition-all ${
                    activeTab === 'CLIENT' ? 'bg-white text-gray-900 shadow-lg' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  For Clients
                </button>
                <button 
                  onClick={() => setActiveTab('INTERPRETER')}
                  className={`px-8 py-3 rounded-full text-sm font-bold transition-all ${
                    activeTab === 'INTERPRETER' ? 'bg-white text-gray-900 shadow-lg' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  For Interpreters
                </button>
              </div>

              {/* Dynamic Content */}
              <div className="grid md:grid-cols-3 gap-8 text-left max-w-4xl mx-auto animate-fade-in">
                {activeTab === 'CLIENT' ? (
                  <>
                    <div className="bg-gray-800/50 border border-gray-700 p-6 rounded-2xl">
                      <Building2 className="text-blue-400 mb-4" size={32} />
                      <h4 className="text-white font-bold mb-2">Corporate Portal</h4>
                      <p className="text-gray-400 text-sm">Manage multiple bookings, cost codes, and departments in one view.</p>
                    </div>
                    <div className="bg-gray-800/50 border border-gray-700 p-6 rounded-2xl">
                      <Clock className="text-blue-400 mb-4" size={32} />
                      <h4 className="text-white font-bold mb-2">Live Status</h4>
                      <p className="text-gray-400 text-sm">Track when your interpreter is assigned, en route, or arrived.</p>
                    </div>
                    <div className="bg-gray-800/50 border border-gray-700 p-6 rounded-2xl">
                      <ShieldCheck className="text-blue-400 mb-4" size={32} />
                      <h4 className="text-white font-bold mb-2">Total Control</h4>
                      <p className="text-gray-400 text-sm">Approve timesheets digitally. No more paper forms or billing disputes.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-gray-800/50 border border-gray-700 p-6 rounded-2xl">
                      <Users className="text-purple-400 mb-4" size={32} />
                      <h4 className="text-white font-bold mb-2">Job Feed</h4>
                      <p className="text-gray-400 text-sm">Receive offers matching your languages and location directly to your phone.</p>
                    </div>
                    <div className="bg-gray-800/50 border border-gray-700 p-6 rounded-2xl">
                      <LayoutDashboard className="text-purple-400 mb-4" size={32} />
                      <h4 className="text-white font-bold mb-2">Smart Schedule</h4>
                      <p className="text-gray-400 text-sm">View upcoming assignments, maps, and special notes in one clean interface.</p>
                    </div>
                    <div className="bg-gray-800/50 border border-gray-700 p-6 rounded-2xl">
                      <CheckCircle2 className="text-purple-400 mb-4" size={32} />
                      <h4 className="text-white font-bold mb-2">Fast Payment</h4>
                      <p className="text-gray-400 text-sm">Submit digital timesheets and generate invoices with a single click.</p>
                    </div>
                  </>
                )}
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
                Bridging language barriers with technology and trust. The modern platform for professional interpreting services.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-gray-900 mb-4">Platform</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><Link to="/login" className="hover:text-blue-600">Client Login</Link></li>
                <li><Link to="/login" className="hover:text-blue-600">Interpreter Login</Link></li>
                <li><Link to="/request" className="hover:text-blue-600">Guest Booking</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-gray-900 mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#" className="hover:text-blue-600">About Us</a></li>
                <li><a href="#" className="hover:text-blue-600">Contact</a></li>
                <li><a href="#" className="hover:text-blue-600">Privacy Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center">
            <p className="text-sm text-gray-400">© 2024 Lingland Ltd. All rights reserved.</p>
            <div className="flex space-x-4 mt-4 md:mt-0">
              <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-500 font-bold">ISO 9001</span>
              <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-500 font-bold">GDPR Compliant</span>
            </div>
          </div>
        </div>
      </footer>

      {/* --- MOBILE STICKY CTA --- */}
      {!user && (
        <div className="md:hidden fixed bottom-0 w-full bg-white border-t border-gray-200 p-4 z-40">
          <Link to="/request" className="block w-full py-3 bg-blue-600 text-white text-center font-bold rounded-xl shadow-lg">
            Book an Interpreter
          </Link>
        </div>
      )}
    </div>
  );
};
