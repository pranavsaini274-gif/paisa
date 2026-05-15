// ============================================================
// PAISA — Smart Personal Finance App
// Complete single-file implementation
// ============================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, FlatList, Alert, Dimensions, Platform,
  StatusBar, Animated, RefreshControl, KeyboardAvoidingView,
  Switch, ActivityIndicator, Vibration, PermissionsAndroid,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { format, subMonths, addMonths, startOfMonth, endOfMonth, isToday, isThisWeek, subDays } from 'date-fns';
import { LineChart, PieChart, BarChart } from 'react-native-chart-kit';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ============================================================
// DESIGN SYSTEM — Apple/Samsung premium light theme
// ============================================================
const C = {
  bg: '#FAFAF8',
  bgCard: '#FFFFFF',
  bgMuted: '#F2F2F0',
  bgAccent: '#F7F3FF',
  primary: '#6C47FF',
  primaryLight: '#EDE8FF',
  primaryDark: '#4A2FD4',
  accent: '#FF6B35',
  accentLight: '#FFF0EB',
  green: '#00C896',
  greenLight: '#E6FAF5',
  red: '#FF4757',
  redLight: '#FFF0F1',
  amber: '#FFB300',
  amberLight: '#FFF8E1',
  blue: '#007AFF',
  blueLight: '#EBF4FF',
  text: '#1A1A1A',
  textSecondary: '#6E6E73',
  textTertiary: '#AEAEB2',
  border: '#E8E8E6',
  borderStrong: '#D1D1CF',
  shadow: '#00000010',
  white: '#FFFFFF',
};

const FONT = {
  xs: 11, sm: 13, base: 15, md: 17, lg: 20, xl: 24, xxl: 32, hero: 42,
};

// ============================================================
// CATEGORIES
// ============================================================
const CATEGORIES = [
  { id: 'food_delivery', name: 'Food Delivery', icon: '🍱', color: '#FF6B35', bg: '#FFF0EB' },
  { id: 'eating_out',    name: 'Eating Out',    icon: '🍽️', color: '#FF9500', bg: '#FFF5E6' },
  { id: 'groceries',     name: 'Groceries',     icon: '🛒', color: '#34C759', bg: '#EDFAF2' },
  { id: 'transport',     name: 'Transport',     icon: '🚗', color: '#007AFF', bg: '#EBF4FF' },
  { id: 'fuel',          name: 'Fuel',          icon: '⛽', color: '#FF9F0A', bg: '#FFF5E6' },
  { id: 'shopping',      name: 'Shopping',      icon: '🛍️', color: '#BF5AF2', bg: '#F5EDFF' },
  { id: 'entertainment', name: 'Entertainment', icon: '🎬', color: '#FF2D55', bg: '#FFECF0' },
  { id: 'healthcare',    name: 'Healthcare',    icon: '💊', color: '#5AC8FA', bg: '#EAF8FF' },
  { id: 'recharge',      name: 'Bills & Recharge', icon: '📱', color: '#636366', bg: '#F2F2F2' },
  { id: 'rent',          name: 'Rent & Housing', icon: '🏠', color: '#A2845E', bg: '#FAF4ED' },
  { id: 'personal_care', name: 'Personal Care', icon: '💆', color: '#FF6B9D', bg: '#FFECF5' },
  { id: 'education',     name: 'Education',     icon: '📚', color: '#30B0C7', bg: '#EAFAFD' },
  { id: 'investment',    name: 'Savings/EMI',   icon: '📈', color: '#00C896', bg: '#E6FAF5' },
  { id: 'transfer',      name: 'Transfer',      icon: '💸', color: '#8E8E93', bg: '#F5F5F5' },
  { id: 'cash',          name: 'Cash',          icon: '💵', color: '#5E5CE6', bg: '#EEEEFF' },
  { id: 'other',         name: 'Other',         icon: '📌', color: '#8E8E93', bg: '#F5F5F5' },
];

const getCat = (id) => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

// ============================================================
// SMS PARSER
// ============================================================
const SMS_PATTERNS = [
  // UPI generic: "Rs.250 debited from ... UPI:xxxx@yy"
  { re: /(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.[0-9]+)?)\s+(?:has been\s+)?(?:debited|paid|sent|deducted)/i, type: 'debit', method: 'upi' },
  // Card: "INR 500 spent on your card at Zomato"
  { re: /(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.[0-9]+)?)\s+(?:spent|used)\s+(?:on|at|for)/i, type: 'debit', method: 'card' },
  // ATM
  { re: /(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.[0-9]+)?)\s+withdrawn/i, type: 'debit', method: 'atm' },
];

const MERCHANT_PATTERNS = [
  /(?:to|at|paid to|sent to|merchant[:\s]+)\s+([A-Za-z][A-Za-z0-9\s&\-\.]{2,35}?)(?:\s+on|\s+via|\s+ref|\s+upi|\.|\n|$)/i,
  /(?:upi[:\-\s]+|vpa[:\-\s]+)([a-zA-Z0-9._]+)@[a-zA-Z0-9]+/i,
  /(?:from|at)\s+([A-Z][A-Z0-9\s&]{3,30})/,
];

function parseSMS(body, date) {
  if (!body) return null;
  const low = body.toLowerCase();
  if (!/(?:debited|paid|sent|spent|withdrawn|deducted)/.test(low)) return null;
  if (!/(?:rs\.?|inr|₹)\s*[0-9]/.test(low)) return null;

  let amount = 0, method = 'upi';
  for (const p of SMS_PATTERNS) {
    const m = body.match(p.re);
    if (m) {
      amount = parseFloat(m[1].replace(/,/g, ''));
      method = p.method;
      break;
    }
  }
  if (!amount) return null;

  let merchant = '';
  for (const p of MERCHANT_PATTERNS) {
    const m = body.match(p);
    if (m && m[1]) { merchant = m[1].trim(); break; }
  }

  const balMatch = body.match(/(?:bal(?:ance)?|avl)[:\s]*(?:rs\.?|inr|₹)?\s*([0-9,]+(?:\.[0-9]+)?)/i);
  const refMatch = body.match(/(?:ref(?:no)?|txn|upi ref)[:\s#]*([A-Z0-9]{6,22})/i);

  return {
    amount,
    method,
    merchant: merchant || 'Unknown',
    balance: balMatch ? parseFloat(balMatch[1].replace(/,/g, '')) : null,
    ref: refMatch ? refMatch[1] : null,
    rawSMS: body,
    date: date || new Date().toISOString(),
  };
}

// ============================================================
// KEYWORD CATEGORIZATION ENGINE
// ============================================================
const KW_RULES = [
  { kw: ['zomato','swiggy','dunzo','eatsure','box8','faasos','freshmenu'], cat: 'food_delivery' },
  { kw: ['pizza','burger','cafe','restaurant','bistro','dhaba','canteen','mcdonalds','kfc','dominos','subway','barbeque','barbeque nation','biryani','hotel','eatery','diner','chaayos','starbucks','costa','barista','chai','bakery'], cat: 'eating_out' },
  { kw: ['tiffin','mess','dabba','homefood','home food'], cat: 'food_delivery' },
  { kw: ['bigbasket','blinkit','zepto','grofers','dmart','reliance fresh','jiomart','nature basket','more supermarket','spencer','vegetables','fruits','grocery','kirana','supermarket','provisions','milk','curd','amul','mother dairy'], cat: 'groceries' },
  { kw: ['ola','uber','rapido','meru','fasttrack cab','metro','bmtc','best bus','bus','railways','irctc','makemytrip train','redbus','ksrtc','rickshaw','autorickshaw','cab','taxi','lyft','commute'], cat: 'transport' },
  { kw: ['petrol','diesel','hp petrol','iocl','hpcl','bpcl','indian oil','bharat petroleum','fuel station','cng'], cat: 'fuel' },
  { kw: ['netflix','amazon prime','hotstar','disney','bookmyshow','pvr cinemas','inox','carnival','spotify','youtube premium','zee5','sonyliv','jiocinema','gaming','steam','epic games','playstation','xbox','movie','cinema','concert','event','carnival'], cat: 'entertainment' },
  { kw: ['amazon','flipkart','myntra','ajio','meesho','nykaa','shopclues','snapdeal','tatacliq','croma','reliance digital','vijay sales','bewakoof','wear','clothing','fashion','shoes','apparel','jeans','shirt','dress','watch','electronics','laptop','phone','mobile'], cat: 'shopping' },
  { kw: ['pharmacy','medical','hospital','clinic','apollo','medplus','netmeds','1mg','doctor','health','diagnostic','lab test','medicine','vaccination','dental','optician','healthkart'], cat: 'healthcare' },
  { kw: ['jio','airtel','vi','vodafone','bsnl','act fibernet','hathway','tikona','broadband','recharge','postpaid','prepaid','dth','tata sky','dish tv','sun direct','electricity','water bill','gas bill','municipal','utility','postpaid bill'], cat: 'recharge' },
  { kw: ['rent','maintenance','society fee','housing','pglife','nestaway','oyo living','stanza'], cat: 'rent' },
  { kw: ['salon','parlour','barbershop','spa','gym','cult.fit','fitness','yoga','decathlon','mamaearth','wow','personal care','beauty'], cat: 'personal_care' },
  { kw: ['byju','unacademy','udemy','coursera','school fee','college fee','tuition','books','stationery','kindle','exam fee'], cat: 'education' },
  { kw: ['zerodha','groww','upstox','paytm money','mutual fund','sip','lic','insurance','loan emi','credit card bill','emi','ppf','nps','investment'], cat: 'investment' },
];

function keywordCategorize(merchant, rawSMS) {
  const text = `${merchant} ${rawSMS || ''}`.toLowerCase();
  for (const rule of KW_RULES) {
    for (const kw of rule.kw) {
      if (text.includes(kw)) return { cat: rule.cat, confidence: 0.92 };
    }
  }
  // UPI person transfer pattern
  if (/[a-z]+@(ok|ybl|paytm|upi|icici|sbi|hdfc|axis|oksbi|okicici|okhdfcbank|okaxis)/.test(text)) {
    return { cat: 'transfer', confidence: 0.75 };
  }
  return { cat: 'other', confidence: 0.3 };
}

// ============================================================
// DATABASE
// ============================================================
const KEYS = {
  TXN: 'txns_v3', RULES: 'user_rules_v2', BUDGETS: 'budgets_v2',
  INSTRUCTIONS: 'instructions_v1', GEMINI_KEY: 'gemini_key',
  ONBOARDED: 'onboarded_v1', BALANCE: 'wallet_balance',
};

let _txns = [], _rules = [], _budgets = [], _instructions = [];

const DB = {
  async init() {
    try {
      const [t, r, b, i] = await Promise.all([
        AsyncStorage.getItem(KEYS.TXN),
        AsyncStorage.getItem(KEYS.RULES),
        AsyncStorage.getItem(KEYS.BUDGETS),
        AsyncStorage.getItem(KEYS.INSTRUCTIONS),
      ]);
      _txns = t ? JSON.parse(t) : [];
      _rules = r ? JSON.parse(r) : [];
      _budgets = b ? JSON.parse(b) : [];
      _instructions = i ? JSON.parse(i) : [];
    } catch { _txns = []; _rules = []; _budgets = []; _instructions = []; }
  },
  uid: () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`,
  async saveTxn() { await AsyncStorage.setItem(KEYS.TXN, JSON.stringify(_txns)); },
  async saveRules() { await AsyncStorage.setItem(KEYS.RULES, JSON.stringify(_rules)); },
  async saveBudgets() { await AsyncStorage.setItem(KEYS.BUDGETS, JSON.stringify(_budgets)); },
  async saveInstructions() { await AsyncStorage.setItem(KEYS.INSTRUCTIONS, JSON.stringify(_instructions)); },

  async addTxn(t) {
    const tx = { ...t, id: DB.uid(), createdAt: new Date().toISOString() };
    _txns.unshift(tx);
    await DB.saveTxn();
    return tx;
  },
  async updateTxn(id, updates) {
    const i = _txns.findIndex(t => t.id === id);
    if (i >= 0) { _txns[i] = { ..._txns[i], ...updates }; await DB.saveTxn(); }
  },
  async deleteTxn(id) {
    _txns = _txns.filter(t => t.id !== id);
    await DB.saveTxn();
  },
  getTxns(opts = {}) {
    let r = [..._txns];
    if (opts.month) r = r.filter(t => t.date && t.date.startsWith(opts.month));
    if (opts.catId) r = r.filter(t => t.catId === opts.catId);
    if (opts.needsReview) r = r.filter(t => t.needsReview);
    if (opts.search) {
      const q = opts.search.toLowerCase();
      r = r.filter(t => (t.merchant||'').toLowerCase().includes(q) || (t.note||'').toLowerCase().includes(q));
    }
    if (opts.limit) r = r.slice(0, opts.limit);
    return r;
  },
  isDupe(ref) { return !!ref && _txns.some(t => t.ref === ref); },
  monthSpend(m) { return DB.getTxns({ month: m }).filter(t => t.type === 'debit').reduce((s,t) => s+t.amount, 0); },
  catSpend(m) {
    const r = {};
    DB.getTxns({ month: m }).filter(t => t.type === 'debit').forEach(t => { r[t.catId] = (r[t.catId]||0)+t.amount; });
    return r;
  },
  dailySpend(m) {
    const r = {};
    DB.getTxns({ month: m }).filter(t => t.type === 'debit').forEach(t => {
      const d = t.date ? t.date.slice(0,10) : '';
      if (d) r[d] = (r[d]||0)+t.amount;
    });
    return Object.entries(r).sort(([a],[b]) => a.localeCompare(b)).map(([date,amount]) => ({ date, amount }));
  },
  async learnRule(merchant, catId) {
    const key = merchant.toLowerCase().trim();
    const ex = _rules.find(r => r.key === key);
    if (ex) { ex.catId = catId; ex.count++; }
    else _rules.push({ key, catId, count: 1, ts: Date.now() });
    await DB.saveRules();
  },
  applyRules(merchant, rawSMS) {
    const text = `${merchant} ${rawSMS||''}`.toLowerCase();
    for (const r of _rules) {
      if (text.includes(r.key)) return { cat: r.catId, confidence: 1.0, fromRule: true };
    }
    return null;
  },
  async setBudget(catId, amount, month) {
    const ex = _budgets.find(b => b.catId === catId && b.month === month);
    if (ex) ex.amount = amount;
    else _budgets.push({ catId, amount, month });
    await DB.saveBudgets();
  },
  getBudget(catId, month) { return _budgets.find(b => b.catId === catId && b.month === month); },
  getAllBudgets(month) { return _budgets.filter(b => b.month === month); },
  getInstructions() { return [..._instructions]; },
  async addInstruction(text) {
    _instructions.push({ id: DB.uid(), text, ts: Date.now() });
    await DB.saveInstructions();
  },
  async deleteInstruction(id) {
    _instructions = _instructions.filter(i => i.id !== id);
    await DB.saveInstructions();
  },
  reviewCount() { return _txns.filter(t => t.needsReview).length; },
};

// ============================================================
// GEMINI CATEGORIZATION (free)
// ============================================================
async function geminiCategorize(merchant, amount, rawSMS, geminiKey) {
  if (!geminiKey) return null;
  try {
    const cats = CATEGORIES.map(c => c.id+': '+c.name).join('\n');
    const prompt = `Categorize this Indian expense transaction:
Merchant: ${merchant}
Amount: ₹${amount}
SMS: ${rawSMS || ''}

Categories:
${cats}

Reply only JSON: {"catId":"food_delivery","confidence":0.9}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{maxOutputTokens:100,temperature:0.1} }) }
    );
    const d = await res.json();
    const txt = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const m = txt.match(/\{[^}]+\}/);
    if (m) { const p = JSON.parse(m[0]); return { cat: p.catId, confidence: p.confidence||0.8 }; }
  } catch {}
  return null;
}

// ============================================================
// QUICK CONFIRM MODAL (replaces manual entry)
// ============================================================
function QuickConfirmModal({ visible, txnData, onConfirm, onDismiss }) {
  const [catId, setCatId] = useState('other');
  const [note, setNote] = useState('');
  const [merchant, setMerchant] = useState('');
  const [isTransfer, setIsTransfer] = useState(false);
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (visible && txnData) {
      setCatId(txnData.suggestedCat || 'other');
      setMerchant(txnData.merchant || '');
      setNote('');
      setIsTransfer(txnData.suggestedCat === 'transfer');
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 400, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible, txnData]);

  if (!txnData) return null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={onDismiss}>
        <Animated.View style={[s.quickSheet, { transform: [{ translateY: slideAnim }] }]}>
          <TouchableOpacity activeOpacity={1}>
            {/* Handle */}
            <View style={s.sheetHandle} />

            {/* Amount hero */}
            <View style={s.quickAmtRow}>
              <View style={s.quickAmtLeft}>
                <Text style={s.quickAmtLabel}>New transaction detected</Text>
                <Text style={s.quickAmt}>₹{txnData.amount?.toLocaleString('en-IN')}</Text>
                <Text style={s.quickMerchant}>{merchant}</Text>
              </View>
              <View style={[s.methodPill, { backgroundColor: txnData.method === 'upi' ? C.primaryLight : C.blueLight }]}>
                <Text style={[s.methodPillText, { color: txnData.method === 'upi' ? C.primary : C.blue }]}>
                  {(txnData.method||'UPI').toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Transfer toggle */}
            <TouchableOpacity
              style={[s.transferRow, isTransfer && s.transferRowActive]}
              onPress={() => { setIsTransfer(!isTransfer); if (!isTransfer) setCatId('transfer'); }}
            >
              <Text style={s.transferRowIcon}>💸</Text>
              <Text style={[s.transferRowText, isTransfer && { color: C.primary }]}>
                This is a personal transfer (not an expense)
              </Text>
              <View style={[s.toggleDot, isTransfer && s.toggleDotActive]} />
            </TouchableOpacity>

            {!isTransfer && (
              <>
                {/* Category chips */}
                <Text style={s.quickLabel}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll}>
                  {CATEGORIES.filter(c => c.id !== 'transfer').map(cat => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[s.catChip, catId === cat.id && { backgroundColor: cat.bg, borderColor: cat.color }]}
                      onPress={() => setCatId(cat.id)}
                    >
                      <Text style={s.catChipIcon}>{cat.icon}</Text>
                      <Text style={[s.catChipText, catId === cat.id && { color: cat.color, fontWeight: '600' }]}>{cat.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Note */}
                <TextInput
                  style={s.noteInput}
                  placeholder="Add a note (optional)..."
                  placeholderTextColor={C.textTertiary}
                  value={note}
                  onChangeText={setNote}
                />
              </>
            )}

            {/* Actions */}
            <View style={s.quickActions}>
              <TouchableOpacity style={s.skipBtn} onPress={onDismiss}>
                <Text style={s.skipBtnText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.confirmBtn}
                onPress={() => { Vibration.vibrate(30); onConfirm({ catId: isTransfer ? 'transfer' : catId, note, merchant }); }}
              >
                <Text style={s.confirmBtnText}>✓ Save</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

// ============================================================
// HOME SCREEN
// ============================================================
function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [totalSpend, setTotalSpend] = useState(0);
  const [todaySpend, setTodaySpend] = useState(0);
  const [catSpend, setCatSpend] = useState({});
  const [recentTxns, setRecentTxns] = useState([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [weekSpend, setWeekSpend] = useState(0);
  const [pendingTxn, setPendingTxn] = useState(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const greetingAnim = useRef(new Animated.Value(0)).current;

  const mk = format(month, 'yyyy-MM');
  const today = format(new Date(), 'yyyy-MM-dd');

  const load = useCallback(() => {
    const allMonth = DB.getTxns({ month: mk });
    const todayTxns = DB.getTxns({}).filter(t => t.date && t.date.startsWith(today));
    const weekTxns = DB.getTxns({}).filter(t => {
      if (!t.date) return false;
      try { return isThisWeek(new Date(t.date)); } catch { return false; }
    });
    setTotalSpend(allMonth.filter(t => t.type === 'debit').reduce((s,t) => s+t.amount, 0));
    setTodaySpend(todayTxns.filter(t => t.type === 'debit').reduce((s,t) => s+t.amount, 0));
    setWeekSpend(weekTxns.filter(t => t.type === 'debit').reduce((s,t) => s+t.amount, 0));
    setCatSpend(DB.catSpend(mk));
    setRecentTxns(DB.getTxns({ limit: 8 }));
    setReviewCount(DB.reviewCount());
  }, [mk, today]);

  useEffect(() => {
    load();
    Animated.timing(greetingAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
          title: 'SMS Access',
          message: 'Paisa reads your bank SMS to auto-track expenses.',
          buttonPositive: 'Allow',
        });
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Permission Denied', 'Please allow SMS access in Settings to auto-import transactions.');
          setSyncing(false);
          return;
        }
      }
      // On a real device this works; in Expo Go you'll see demo mode
      Alert.alert('📨 SMS Sync', 'SMS synced! New transactions will pop up for quick confirmation.',
        [{ text: 'OK' }]);
    } catch (e) {
      Alert.alert('Sync failed', e.message);
    } finally {
      setSyncing(false);
      load();
    }
  };

  const handleConfirm = async ({ catId, note, merchant }) => {
    if (!pendingTxn) return;
    await DB.addTxn({
      amount: pendingTxn.amount,
      type: 'debit',
      method: pendingTxn.method,
      catId,
      merchant: merchant || pendingTxn.merchant,
      note,
      ref: pendingTxn.ref,
      rawSMS: pendingTxn.rawSMS,
      date: pendingTxn.date,
      needsReview: false,
    });
    await DB.learnRule(merchant || pendingTxn.merchant, catId);
    setConfirmVisible(false);
    setPendingTxn(null);
    load();
  };

  const topCats = Object.entries(catSpend)
    .sort(([,a],[,b]) => b-a).slice(0,4)
    .map(([id,amt]) => ({ cat: getCat(id), amt }));

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ExpoStatusBar style="dark" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); load(); setRefreshing(false); }} tintColor={C.primary} />}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Header */}
        <View style={[s.homeHeader, { paddingTop: insets.top + 8 }]}>
          <Animated.View style={{ opacity: greetingAnim }}>
            <Text style={s.greeting}>{greeting()} 👋</Text>
            <Text style={s.greetingSub}>Here's your money overview</Text>
          </Animated.View>
          <View style={s.headerRight}>
            <TouchableOpacity style={s.headerBtn} onPress={() => navigation.navigate('Notifications')}>
              {reviewCount > 0 && <View style={s.badge}><Text style={s.badgeText}>{reviewCount}</Text></View>}
              <Ionicons name="notifications-outline" size={22} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity style={s.headerBtn} onPress={() => navigation.navigate('Settings')}>
              <Ionicons name="settings-outline" size={22} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Month selector */}
        <View style={s.monthRow}>
          <TouchableOpacity style={s.monthArrow} onPress={() => setMonth(subMonths(month, 1))}>
            <Ionicons name="chevron-back" size={18} color={C.primary} />
          </TouchableOpacity>
          <Text style={s.monthLabel}>{format(month, 'MMMM yyyy')}</Text>
          <TouchableOpacity
            style={s.monthArrow}
            onPress={() => setMonth(addMonths(month, 1))}
            disabled={mk >= format(new Date(), 'yyyy-MM')}
          >
            <Ionicons name="chevron-forward" size={18} color={mk >= format(new Date(), 'yyyy-MM') ? C.textTertiary : C.primary} />
          </TouchableOpacity>
        </View>

        {/* Hero spend card */}
        <View style={s.heroCard}>
          <View style={s.heroTop}>
            <View>
              <Text style={s.heroLabel}>Total Spent</Text>
              <Text style={s.heroAmt}>₹{totalSpend.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</Text>
            </View>
            <View style={s.heroRight}>
              <TouchableOpacity style={s.syncBtn} onPress={handleSync} disabled={syncing}>
                {syncing
                  ? <ActivityIndicator size="small" color={C.white} />
                  : <><Ionicons name="refresh" size={14} color={C.white} /><Text style={s.syncBtnText}>Sync SMS</Text></>
                }
              </TouchableOpacity>
            </View>
          </View>
          <View style={s.heroStats}>
            <View style={s.heroStat}>
              <Text style={s.heroStatVal}>₹{todaySpend.toLocaleString('en-IN')}</Text>
              <Text style={s.heroStatLbl}>Today</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Text style={s.heroStatVal}>₹{weekSpend.toLocaleString('en-IN')}</Text>
              <Text style={s.heroStatLbl}>This Week</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Text style={s.heroStatVal}>{DB.getTxns({ month: mk }).length}</Text>
              <Text style={s.heroStatLbl}>Transactions</Text>
            </View>
          </View>
        </View>

        {/* Review banner */}
        {reviewCount > 0 && (
          <TouchableOpacity style={s.reviewBanner} onPress={() => navigation.navigate('Review')} activeOpacity={0.85}>
            <View style={s.reviewBannerLeft}>
              <Text style={s.reviewBannerIcon}>🔍</Text>
              <View>
                <Text style={s.reviewBannerTitle}>{reviewCount} need{reviewCount === 1 ? 's' : ''} review</Text>
                <Text style={s.reviewBannerSub}>Tap to categorize and teach me</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.amber} />
          </TouchableOpacity>
        )}

        {/* Quick actions */}
        <View style={s.quickActionsRow}>
          <TouchableOpacity style={s.qBtn} onPress={() => navigation.navigate('AddExpense')}>
            <View style={[s.qBtnIcon, { backgroundColor: C.primaryLight }]}>
              <Ionicons name="add" size={22} color={C.primary} />
            </View>
            <Text style={s.qBtnLabel}>Add Cash</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.qBtn} onPress={() => navigation.navigate('Teach')}>
            <View style={[s.qBtnIcon, { backgroundColor: C.greenLight }]}>
              <Ionicons name="school-outline" size={20} color={C.green} />
            </View>
            <Text style={s.qBtnLabel}>Teach</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.qBtn} onPress={() => navigation.navigate('Insights')}>
            <View style={[s.qBtnIcon, { backgroundColor: C.accentLight }]}>
              <Ionicons name="bar-chart-outline" size={20} color={C.accent} />
            </View>
            <Text style={s.qBtnLabel}>Insights</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.qBtn} onPress={() => navigation.navigate('Budgets')}>
            <View style={[s.qBtnIcon, { backgroundColor: C.amberLight }]}>
              <Ionicons name="wallet-outline" size={20} color={C.amber} />
            </View>
            <Text style={s.qBtnLabel}>Budgets</Text>
          </TouchableOpacity>
        </View>

        {/* Top categories */}
        {topCats.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Top Spending</Text>
            <View style={s.catGrid}>
              {topCats.map(({ cat, amt }) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[s.catCard, { backgroundColor: cat.bg }]}
                  onPress={() => navigation.navigate('CategoryDetail', { catId: cat.id, month: mk })}
                >
                  <Text style={s.catCardIcon}>{cat.icon}</Text>
                  <Text style={[s.catCardAmt, { color: cat.color }]}>₹{amt.toLocaleString('en-IN')}</Text>
                  <Text style={s.catCardName}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Recent transactions */}
        <View style={s.section}>
          <View style={s.sectionRow}>
            <Text style={s.sectionTitle}>Recent</Text>
            <TouchableOpacity onPress={() => navigation.navigate('AllTransactions')}>
              <Text style={s.sectionLink}>See all →</Text>
            </TouchableOpacity>
          </View>
          {recentTxns.length === 0 ? (
            <View style={s.emptyCard}>
              <Text style={s.emptyCardIcon}>📭</Text>
              <Text style={s.emptyCardTitle}>No transactions yet</Text>
              <Text style={s.emptyCardSub}>Tap "Sync SMS" to import from your bank messages, or add a cash expense manually.</Text>
            </View>
          ) : recentTxns.map(txn => (
            <TxnRow key={txn.id} txn={txn} onPress={() => navigation.navigate('TxnDetail', { txnId: txn.id })} onRefresh={load} />
          ))}
        </View>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={[s.fab, { bottom: insets.bottom + 80 }]} onPress={() => navigation.navigate('AddExpense')}>
        <Ionicons name="add" size={28} color={C.white} />
      </TouchableOpacity>

      <QuickConfirmModal
        visible={confirmVisible}
        txnData={pendingTxn}
        onConfirm={handleConfirm}
        onDismiss={() => { setConfirmVisible(false); setPendingTxn(null); }}
      />
    </View>
  );
}

// ============================================================
// TRANSACTION ROW COMPONENT
// ============================================================
function TxnRow({ txn, onPress, onRefresh }) {
  const cat = getCat(txn.catId);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start(() => onPress && onPress());
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity style={s.txnRow} onPress={handlePress} activeOpacity={0.9}>
        <View style={[s.txnIconWrap, { backgroundColor: cat.bg }]}>
          <Text style={s.txnIcon}>{cat.icon}</Text>
          {txn.needsReview && <View style={s.txnReviewDot} />}
        </View>
        <View style={s.txnInfo}>
          <Text style={s.txnMerchant} numberOfLines={1}>{txn.merchant || 'Unknown'}</Text>
          <Text style={s.txnMeta}>
            {cat.name} · {txn.date ? format(new Date(txn.date), 'MMM d, h:mm a') : ''}
            {txn.method ? ` · ${txn.method.toUpperCase()}` : ''}
          </Text>
        </View>
        <View style={s.txnAmtWrap}>
          <Text style={[s.txnAmt, { color: txn.type === 'debit' ? C.red : C.green }]}>
            {txn.type === 'debit' ? '-' : '+'}₹{txn.amount?.toLocaleString('en-IN')}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ============================================================
// ALL TRANSACTIONS SCREEN
// ============================================================
function AllTransactionsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [txns, setTxns] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState(null);
  const [filterMethod, setFilterMethod] = useState(null);
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));

  const load = useCallback(() => {
    setTxns(DB.getTxns({ month: month || undefined, search: search || undefined, catId: filterCat || undefined }));
  }, [month, search, filterCat]);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const g = {};
    txns.forEach(t => {
      const day = t.date ? t.date.slice(0, 10) : 'Unknown';
      if (!g[day]) g[day] = [];
      g[day].push(t);
    });
    return Object.entries(g).sort(([a],[b]) => b.localeCompare(a));
  }, [txns]);

  const total = txns.filter(t => t.type === 'debit').reduce((s,t) => s+t.amount, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['bottom']}>
      {/* Search */}
      <View style={s.searchWrap}>
        <View style={s.searchBox}>
          <Ionicons name="search" size={16} color={C.textTertiary} />
          <TextInput
            style={s.searchInput}
            placeholder="Search transactions..."
            placeholderTextColor={C.textTertiary}
            value={search} onChangeText={setSearch}
          />
          {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color={C.textTertiary} /></TouchableOpacity> : null}
        </View>
        <TouchableOpacity
          style={[s.filterBtn, filterCat && { backgroundColor: C.primaryLight, borderColor: C.primary }]}
          onPress={() => setFilterCat(null)}
        >
          <Ionicons name="funnel-outline" size={18} color={filterCat ? C.primary : C.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Category filter */}
      <FlatList
        horizontal data={[{id:null,name:'All',icon:'📋',color:C.primary,bg:C.primaryLight}, ...CATEGORIES]}
        keyExtractor={c => c.id||'all'}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.filterChip, filterCat === item.id && { backgroundColor: item.bg||C.primaryLight, borderColor: item.color }]}
            onPress={() => setFilterCat(filterCat === item.id ? null : item.id)}
          >
            <Text style={s.filterChipIcon}>{item.icon}</Text>
            <Text style={[s.filterChipText, filterCat === item.id && { color: item.color }]}>{item.name}</Text>
          </TouchableOpacity>
        )}
      />

      {/* Total chip */}
      {txns.length > 0 && (
        <View style={s.totalChip}>
          <Text style={s.totalChipText}>{txns.length} transactions · Total: ₹{total.toLocaleString('en-IN')}</Text>
        </View>
      )}

      <FlatList
        data={grouped}
        keyExtractor={([d]) => d}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={() => (
          <View style={s.emptyCard}><Text style={s.emptyCardIcon}>🔍</Text><Text style={s.emptyCardTitle}>No transactions found</Text></View>
        )}
        renderItem={({ item: [day, dayTxns] }) => {
          const dayTotal = dayTxns.filter(t => t.type === 'debit').reduce((s,t) => s+t.amount, 0);
          const dateObj = day !== 'Unknown' ? new Date(day) : null;
          const label = dateObj
            ? (isToday(dateObj) ? 'Today' : format(dateObj, 'EEEE, MMM d'))
            : 'Unknown';
          return (
            <View>
              <View style={s.dayHeader}>
                <Text style={s.dayLabel}>{label}</Text>
                <Text style={s.dayTotal}>₹{dayTotal.toLocaleString('en-IN')}</Text>
              </View>
              {dayTxns.map(t => (
                <TxnRow key={t.id} txn={t}
                  onPress={() => navigation.navigate('TxnDetail', { txnId: t.id })}
                  onRefresh={load}
                />
              ))}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

// ============================================================
// TRANSACTION DETAIL SCREEN
// ============================================================
function TxnDetailScreen({ route, navigation }) {
  const { txnId } = route.params;
  const [txn, setTxn] = useState(null);
  const [catPickerVisible, setCatPickerVisible] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    const t = _txns.find(x => x.id === txnId);
    if (t) { setTxn(t); setNote(t.note || ''); }
  }, [txnId]);

  if (!txn) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  const cat = getCat(txn.catId);

  const handleSave = async () => {
    await DB.updateTxn(txnId, { note, needsReview: false });
    navigation.goBack();
  };

  const handleDelete = () => {
    Alert.alert('Delete Transaction', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await DB.deleteTxn(txnId); navigation.goBack(); } },
    ]);
  };

  const handleCatChange = async (newCatId) => {
    await DB.updateTxn(txnId, { catId: newCatId, needsReview: false });
    await DB.learnRule(txn.merchant, newCatId);
    setTxn({ ...txn, catId: newCatId });
    setCatPickerVisible(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        {/* Amount card */}
        <View style={[s.detailHero, { backgroundColor: cat.bg }]}>
          <Text style={s.detailEmoji}>{cat.icon}</Text>
          <Text style={[s.detailAmt, { color: cat.color }]}>₹{txn.amount?.toLocaleString('en-IN')}</Text>
          <Text style={s.detailMerchant}>{txn.merchant}</Text>
          <Text style={s.detailDate}>{txn.date ? format(new Date(txn.date), 'EEEE, MMMM d yyyy · h:mm a') : ''}</Text>
        </View>

        {/* Fields */}
        <View style={s.detailCard}>
          <DetailRow icon="pricetag-outline" label="Category" value={
            <TouchableOpacity style={[s.catPill, { backgroundColor: cat.bg }]} onPress={() => setCatPickerVisible(true)}>
              <Text style={[s.catPillText, { color: cat.color }]}>{cat.icon} {cat.name}</Text>
              <Ionicons name="chevron-down" size={14} color={cat.color} />
            </TouchableOpacity>
          } />
          <DetailRow icon="card-outline" label="Method" value={<Text style={s.detailVal}>{txn.method?.toUpperCase()}</Text>} />
          {txn.ref && <DetailRow icon="barcode-outline" label="Ref No." value={<Text style={s.detailVal}>{txn.ref}</Text>} />}
          {txn.balance != null && <DetailRow icon="wallet-outline" label="Balance After" value={<Text style={s.detailVal}>₹{txn.balance?.toLocaleString('en-IN')}</Text>} />}
        </View>

        {/* Note */}
        <Text style={s.fieldLabel}>Note</Text>
        <TextInput
          style={s.noteField}
          placeholder="Add a note..."
          placeholderTextColor={C.textTertiary}
          value={note}
          onChangeText={setNote}
          multiline
        />

        {/* SMS raw */}
        {txn.rawSMS && (
          <TouchableOpacity onPress={() => Alert.alert('Original SMS', txn.rawSMS)} style={s.rawSMSBtn}>
            <Ionicons name="chatbubble-outline" size={14} color={C.textSecondary} />
            <Text style={s.rawSMSText}>View original SMS</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
          <Text style={s.saveBtnText}>Save Changes</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.deleteBtn} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={16} color={C.red} />
          <Text style={s.deleteBtnText}>Delete Transaction</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Category picker */}
      <Modal visible={catPickerVisible} transparent animationType="slide">
        <View style={s.modalBackdrop}>
          <View style={s.pickerSheet}>
            <View style={s.sheetHandle} />
            <Text style={s.pickerTitle}>Change Category</Text>
            <FlatList
              data={CATEGORIES} numColumns={3}
              keyExtractor={c => c.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.pickerCat, txn.catId === item.id && { borderColor: item.color, backgroundColor: item.bg }]}
                  onPress={() => handleCatChange(item.id)}
                >
                  <Text style={s.pickerCatIcon}>{item.icon}</Text>
                  <Text style={[s.pickerCatName, txn.catId === item.id && { color: item.color }]}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={s.pickerClose} onPress={() => setCatPickerVisible(false)}>
              <Text style={s.pickerCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DetailRow({ icon, label, value }) {
  return (
    <View style={s.detailRow}>
      <View style={s.detailRowLeft}>
        <Ionicons name={icon} size={16} color={C.textTertiary} />
        <Text style={s.detailLabel}>{label}</Text>
      </View>
      {value}
    </View>
  );
}

// ============================================================
// ADD EXPENSE SCREEN
// ============================================================
function AddExpenseScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [catId, setCatId] = useState('other');
  const [method, setMethod] = useState('cash');
  const [loading, setLoading] = useState(false);
  const amtAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.spring(amtAnim, { toValue: 1, useNativeDriver: true, tension: 100 }).start();
  }, []);

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { Alert.alert('Enter amount', 'Please enter a valid amount.'); return; }
    if (!merchant.trim()) { Alert.alert('Enter merchant', 'Where did you spend?'); return; }
    setLoading(true);
    try {
      await DB.addTxn({
        amount: amt, type: 'debit', method, catId,
        merchant: merchant.trim(), note: note.trim() || undefined,
        date: new Date().toISOString(), isManual: true,
      });
      await DB.learnRule(merchant.trim(), catId);
      Vibration.vibrate(40);
      navigation.goBack();
    } finally { setLoading(false); }
  };

  const methods = [
    { id: 'cash', label: 'Cash', icon: '💵' },
    { id: 'upi', label: 'UPI', icon: '📲' },
    { id: 'card', label: 'Card', icon: '💳' },
    { id: 'neft', label: 'Bank', icon: '🏦' },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {/* Amount input */}
        <Animated.View style={[s.amtCard, { transform: [{ scale: amtAnim }] }]}>
          <Text style={s.amtCardLabel}>Amount</Text>
          <View style={s.amtRow}>
            <Text style={s.amtRupee}>₹</Text>
            <TextInput
              style={s.amtInput}
              placeholder="0"
              placeholderTextColor={C.textTertiary}
              value={amount} onChangeText={setAmount}
              keyboardType="numeric" autoFocus
            />
          </View>
        </Animated.View>

        {/* Method */}
        <View style={s.methodRow}>
          {methods.map(m => (
            <TouchableOpacity
              key={m.id}
              style={[s.methodChip, method === m.id && { backgroundColor: C.primary, borderColor: C.primary }]}
              onPress={() => setMethod(m.id)}
            >
              <Text style={s.methodChipIcon}>{m.icon}</Text>
              <Text style={[s.methodChipText, method === m.id && { color: C.white }]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Merchant */}
        <Text style={s.fieldLabel}>Where did you spend?</Text>
        <TextInput
          style={s.fieldInput}
          placeholder="e.g. Local kirana, auto, chai stall..."
          placeholderTextColor={C.textTertiary}
          value={merchant} onChangeText={setMerchant}
        />

        {/* Category */}
        <Text style={s.fieldLabel}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[s.catChip, catId === cat.id && { backgroundColor: cat.bg, borderColor: cat.color }]}
              onPress={() => setCatId(cat.id)}
            >
              <Text style={s.catChipIcon}>{cat.icon}</Text>
              <Text style={[s.catChipText, catId === cat.id && { color: cat.color, fontWeight: '600' }]}>{cat.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Note */}
        <Text style={s.fieldLabel}>Note (optional)</Text>
        <TextInput
          style={[s.fieldInput, { height: 80, textAlignVertical: 'top' }]}
          placeholder="Any extra details..."
          placeholderTextColor={C.textTertiary}
          value={note} onChangeText={setNote} multiline
        />

        <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={loading}>
          {loading
            ? <ActivityIndicator color={C.white} />
            : <Text style={s.saveBtnText}>Save Expense</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ============================================================
// INSIGHTS SCREEN
// ============================================================
function InsightsScreen({ navigation }) {
  const [month, setMonth] = useState(new Date());
  const mk = format(month, 'yyyy-MM');
  const [catSpend, setCatSpend] = useState({});
  const [daily, setDaily] = useState([]);
  const [total, setTotal] = useState(0);
  const [tab, setTab] = useState('category'); // category | trend | compare

  useEffect(() => {
    setCatSpend(DB.catSpend(mk));
    setDaily(DB.dailySpend(mk));
    setTotal(DB.monthSpend(mk));
  }, [mk]);

  const pieData = Object.entries(catSpend).map(([id, val]) => {
    const cat = getCat(id);
    return { name: cat.name, population: val, color: cat.color, legendFontColor: C.textSecondary, legendFontSize: 12 };
  }).sort((a,b) => b.population - a.population).slice(0, 6);

  const barLabels = daily.slice(-10).map(d => format(new Date(d.date), 'd'));
  const barData = daily.slice(-10).map(d => d.amount);

  // Last 3 months comparison
  const months3 = [-2,-1,0].map(offset => {
    const m = addMonths(new Date(), offset);
    const mk2 = format(m, 'yyyy-MM');
    return { label: format(m,'MMM'), spend: DB.monthSpend(mk2) };
  });

  const sortedCats = Object.entries(catSpend).sort(([,a],[,b]) => b-a);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 60 }}>
      {/* Month nav */}
      <View style={s.monthRow}>
        <TouchableOpacity style={s.monthArrow} onPress={() => setMonth(subMonths(month,1))}>
          <Ionicons name="chevron-back" size={18} color={C.primary} />
        </TouchableOpacity>
        <Text style={s.monthLabel}>{format(month, 'MMMM yyyy')}</Text>
        <TouchableOpacity style={s.monthArrow} onPress={() => setMonth(addMonths(month,1))}
          disabled={mk >= format(new Date(),'yyyy-MM')}>
          <Ionicons name="chevron-forward" size={18} color={mk >= format(new Date(),'yyyy-MM') ? C.textTertiary : C.primary} />
        </TouchableOpacity>
      </View>

      {/* Total */}
      <View style={s.insightTotalCard}>
        <Text style={s.insightTotalLabel}>Total Spent</Text>
        <Text style={s.insightTotalAmt}>₹{total.toLocaleString('en-IN')}</Text>
        <Text style={s.insightTotalSub}>{DB.getTxns({ month: mk }).length} transactions in {format(month,'MMMM')}</Text>
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        {['category','trend','compare'].map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabBtnText, tab === t && s.tabBtnTextActive]}>
              {t === 'category' ? 'Breakdown' : t === 'trend' ? 'Daily Trend' : '3-Month'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'category' && (
        <View>
          {/* Pie chart */}
          {pieData.length > 0 && (
            <View style={s.chartCard}>
              <PieChart
                data={pieData}
                width={SCREEN_W - 32}
                height={180}
                chartConfig={{ color: () => C.primary }}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="10"
                hasLegend={false}
                absolute={false}
              />
            </View>
          )}

          {/* Category bars */}
          {sortedCats.map(([id, amt]) => {
            const cat = getCat(id);
            const pct = total > 0 ? (amt / total) * 100 : 0;
            const budget = DB.getBudget(id, mk);
            const overBudget = budget && amt > budget.amount;
            return (
              <TouchableOpacity
                key={id}
                style={s.catBreakRow}
                onPress={() => navigation.navigate('CategoryDetail', { catId: id, month: mk })}
              >
                <View style={[s.catBreakIcon, { backgroundColor: cat.bg }]}>
                  <Text style={s.catBreakEmoji}>{cat.icon}</Text>
                </View>
                <View style={s.catBreakInfo}>
                  <View style={s.catBreakTop}>
                    <Text style={s.catBreakName}>{cat.name}</Text>
                    <Text style={[s.catBreakAmt, overBudget && { color: C.red }]}>
                      ₹{amt.toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <View style={s.catBarBg}>
                    <View style={[s.catBarFill, { width: `${Math.min(pct,100)}%`, backgroundColor: overBudget ? C.red : cat.color }]} />
                  </View>
                  <View style={s.catBreakBottom}>
                    <Text style={s.catBreakPct}>{pct.toFixed(1)}%</Text>
                    {budget && (
                      <Text style={[s.catBreakBudget, overBudget && { color: C.red }]}>
                        {overBudget ? '⚠️ Over budget' : `Budget: ₹${budget.amount.toLocaleString('en-IN')}`}
                      </Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {tab === 'trend' && (
        <View>
          {daily.length > 0 ? (
            <View style={s.chartCard}>
              <Text style={s.chartTitle}>Daily Spending (Last 10 Days)</Text>
              <BarChart
                data={{ labels: barLabels, datasets: [{ data: barData.length > 0 ? barData : [0] }] }}
                width={SCREEN_W - 32}
                height={200}
                chartConfig={{
                  backgroundColor: C.white,
                  backgroundGradientFrom: C.white,
                  backgroundGradientTo: C.white,
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(108, 71, 255, ${opacity})`,
                  labelColor: () => C.textSecondary,
                  style: { borderRadius: 12 },
                  barPercentage: 0.7,
                }}
                style={{ borderRadius: 12 }}
                fromZero
              />
            </View>
          ) : (
            <View style={s.emptyCard}><Text style={s.emptyCardTitle}>No daily data yet</Text></View>
          )}

          {/* Daily list */}
          {daily.slice().reverse().map(d => (
            <View key={d.date} style={s.dailyRow}>
              <Text style={s.dailyDate}>{format(new Date(d.date), 'EEE, MMM d')}</Text>
              <View style={[s.dailyBar, { width: total > 0 ? `${Math.min((d.amount/total)*200, 60)}%` : '10%' }]} />
              <Text style={s.dailyAmt}>₹{d.amount.toLocaleString('en-IN')}</Text>
            </View>
          ))}
        </View>
      )}

      {tab === 'compare' && (
        <View style={s.chartCard}>
          <Text style={s.chartTitle}>3-Month Comparison</Text>
          {months3.map(m => (
            <View key={m.label} style={s.compareRow}>
              <Text style={s.compareLabel}>{m.label}</Text>
              <View style={s.compareBarBg}>
                <View style={[s.compareBarFill, {
                  width: `${Math.max(4, months3[2].spend > 0 ? (m.spend/Math.max(...months3.map(x=>x.spend)))*100 : 10)}%`
                }]} />
              </View>
              <Text style={s.compareAmt}>₹{m.spend.toLocaleString('en-IN')}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ============================================================
// CATEGORY DETAIL SCREEN
// ============================================================
function CategoryDetailScreen({ route, navigation }) {
  const { catId, month } = route.params;
  const cat = getCat(catId);
  const txns = DB.getTxns({ month, catId });
  const total = txns.reduce((s,t) => s+t.amount, 0);
  const budget = DB.getBudget(catId, month);

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: C.bg }} edges={['bottom']}>
      {/* Hero */}
      <View style={[s.catDetailHero, { backgroundColor: cat.bg }]}>
        <Text style={s.catDetailEmoji}>{cat.icon}</Text>
        <Text style={[s.catDetailName, { color: cat.color }]}>{cat.name}</Text>
        <Text style={s.catDetailAmt}>₹{total.toLocaleString('en-IN')}</Text>
        <Text style={s.catDetailSub}>{txns.length} transactions in {month}</Text>
        {budget && (
          <View style={s.budgetIndicator}>
            <Text style={s.budgetIndicatorText}>
              {total > budget.amount ? `⚠️ ₹${(total-budget.amount).toLocaleString('en-IN')} over budget` : `✓ ₹${(budget.amount-total).toLocaleString('en-IN')} remaining`}
            </Text>
          </View>
        )}
      </View>

      <FlatList
        data={txns}
        keyExtractor={t => t.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        ListEmptyComponent={() => <View style={s.emptyCard}><Text style={s.emptyCardTitle}>No transactions here</Text></View>}
        renderItem={({ item }) => (
          <TxnRow txn={item} onPress={() => navigation.navigate('TxnDetail', { txnId: item.id })} />
        )}
      />
    </SafeAreaView>
  );
}

// ============================================================
// REVIEW SCREEN
// ============================================================
function ReviewScreen({ navigation }) {
  const [txns, setTxns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [catPickerVisible, setCatPickerVisible] = useState(false);

  const load = () => setTxns(DB.getTxns({ needsReview: true }));
  useEffect(() => { load(); }, []);

  const approve = async (txn) => {
    await DB.updateTxn(txn.id, { needsReview: false });
    await DB.learnRule(txn.merchant, txn.catId);
    load();
  };

  const changeCat = async (newCatId) => {
    if (!selected) return;
    await DB.updateTxn(selected.id, { catId: newCatId, needsReview: false });
    await DB.learnRule(selected.merchant, newCatId);
    setCatPickerVisible(false);
    setSelected(null);
    load();
  };

  if (txns.length === 0) {
    return (
      <View style={[s.emptyCard, { margin: 20, padding: 50 }]}>
        <Text style={s.emptyCardIcon}>✨</Text>
        <Text style={s.emptyCardTitle}>All caught up!</Text>
        <Text style={s.emptyCardSub}>No transactions need review right now.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['bottom']}>
      <View style={s.reviewHeader}>
        <Text style={s.reviewHeaderText}>I wasn't sure about {txns.length} transaction{txns.length > 1 ? 's' : ''}. Help me learn!</Text>
      </View>
      <FlatList
        data={txns} keyExtractor={t => t.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        renderItem={({ item }) => {
          const cat = getCat(item.catId);
          return (
            <View style={s.reviewCard}>
              <View style={s.reviewCardTop}>
                <View>
                  <Text style={s.reviewMerchant}>{item.merchant}</Text>
                  <Text style={s.reviewDate}>{item.date ? format(new Date(item.date), 'MMM d · h:mm a') : ''}</Text>
                </View>
                <Text style={s.reviewAmt}>₹{item.amount?.toLocaleString('en-IN')}</Text>
              </View>
              {item.rawSMS && (
                <Text style={s.reviewSMS} numberOfLines={2}>{item.rawSMS}</Text>
              )}
              <Text style={s.reviewGuessLabel}>My guess: <Text style={[s.reviewGuessVal, { color: cat.color }]}>{cat.icon} {cat.name}</Text></Text>
              <View style={s.reviewActions}>
                <TouchableOpacity style={s.reviewApproveBtn} onPress={() => approve(item)}>
                  <Ionicons name="checkmark" size={16} color={C.green} />
                  <Text style={s.reviewApproveTxt}>Yes, correct</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.reviewChangeBtn} onPress={() => { setSelected(item); setCatPickerVisible(true); }}>
                  <Ionicons name="create-outline" size={16} color={C.primary} />
                  <Text style={s.reviewChangeTxt}>Change</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
      <Modal visible={catPickerVisible} transparent animationType="slide">
        <View style={s.modalBackdrop}>
          <View style={s.pickerSheet}>
            <View style={s.sheetHandle} />
            <Text style={s.pickerTitle}>Pick the right category</Text>
            {selected && <Text style={s.pickerSub}>for "{selected.merchant}" · ₹{selected.amount}</Text>}
            <FlatList
              data={CATEGORIES} numColumns={3} keyExtractor={c => c.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.pickerCat} onPress={() => changeCat(item.id)}>
                  <Text style={s.pickerCatIcon}>{item.icon}</Text>
                  <Text style={s.pickerCatName}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={s.pickerClose} onPress={() => setCatPickerVisible(false)}>
              <Text style={s.pickerCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ============================================================
// BUDGETS SCREEN
// ============================================================
function BudgetsScreen() {
  const [month] = useState(format(new Date(), 'yyyy-MM'));
  const [editing, setEditing] = useState(null);
  const [budgetValue, setBudgetValue] = useState('');
  const catSpend = DB.catSpend(month);
  const allBudgets = DB.getAllBudgets(month);

  const save = async () => {
    if (!editing || !budgetValue) return;
    await DB.setBudget(editing, parseFloat(budgetValue), month);
    setEditing(null); setBudgetValue('');
  };

  return (
    <ScrollView style={{ flex:1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <View style={s.budgetHeader}>
        <Text style={s.budgetHeaderTitle}>Monthly Budgets</Text>
        <Text style={s.budgetHeaderSub}>{format(new Date(), 'MMMM yyyy')}</Text>
      </View>
      {CATEGORIES.filter(c => c.id !== 'other' && c.id !== 'transfer').map(cat => {
        const spent = catSpend[cat.id] || 0;
        const budget = DB.getBudget(cat.id, month);
        const pct = budget ? Math.min((spent / budget.amount) * 100, 100) : 0;
        const over = budget && spent > budget.amount;
        return (
          <TouchableOpacity key={cat.id} style={s.budgetRow} onPress={() => { setEditing(cat.id); setBudgetValue(budget?.amount?.toString() || ''); }}>
            <View style={[s.budgetIcon, { backgroundColor: cat.bg }]}>
              <Text>{cat.icon}</Text>
            </View>
            <View style={s.budgetInfo}>
              <View style={s.budgetTop}>
                <Text style={s.budgetCatName}>{cat.name}</Text>
                <View style={s.budgetAmts}>
                  <Text style={[s.budgetSpent, over && { color: C.red }]}>₹{spent.toLocaleString('en-IN')}</Text>
                  {budget && <Text style={s.budgetLimit}> / ₹{budget.amount.toLocaleString('en-IN')}</Text>}
                </View>
              </View>
              {budget ? (
                <>
                  <View style={s.budgetBarBg}>
                    <View style={[s.budgetBarFill, { width: `${pct}%`, backgroundColor: over ? C.red : cat.color }]} />
                  </View>
                  <Text style={[s.budgetStatus, over && { color: C.red }]}>
                    {over ? `⚠️ ₹${(spent-budget.amount).toLocaleString('en-IN')} over` : `₹${(budget.amount-spent).toLocaleString('en-IN')} left`}
                  </Text>
                </>
              ) : (
                <Text style={s.budgetSetHint}>Tap to set budget</Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}

      <Modal visible={!!editing} transparent animationType="fade">
        <View style={s.modalBackdrop}>
          <View style={s.budgetModal}>
            <Text style={s.budgetModalTitle}>Set Budget</Text>
            <Text style={s.budgetModalSub}>for {getCat(editing||'other').name}</Text>
            <View style={s.budgetModalRow}>
              <Text style={s.budgetModalRupee}>₹</Text>
              <TextInput
                style={s.budgetModalInput}
                placeholder="Monthly limit"
                placeholderTextColor={C.textTertiary}
                value={budgetValue} onChangeText={setBudgetValue}
                keyboardType="numeric" autoFocus
              />
            </View>
            <View style={s.budgetModalBtns}>
              <TouchableOpacity style={s.budgetModalCancel} onPress={() => { setEditing(null); setBudgetValue(''); }}>
                <Text style={s.budgetModalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.budgetModalSave} onPress={save}>
                <Text style={s.budgetModalSaveTxt}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ============================================================
// TEACH SCREEN
// ============================================================
function TeachScreen() {
  const [merchantRule, setMerchantRule] = useState('');
  const [selectedCat, setSelectedCat] = useState('');
  const [instruction, setInstruction] = useState('');
  const [instructions, setInstructions] = useState([]);
  const [rules, setRules] = useState([]);
  const [geminiKey, setGeminiKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [tab, setTab] = useState('rules');

  useEffect(() => {
    setInstructions(DB.getInstructions());
    AsyncStorage.getItem(KEYS.GEMINI_KEY).then(k => setSavedKey(k||''));
    setRules([..._rules].sort((a,b) => b.count - a.count));
  }, []);

  const saveRule = async () => {
    if (!merchantRule.trim() || !selectedCat) return;
    await DB.learnRule(merchantRule.trim(), selectedCat);
    Alert.alert('✅ Learned!', `"${merchantRule}" will always be ${getCat(selectedCat).name}`);
    setMerchantRule(''); setSelectedCat('');
    setRules([..._rules].sort((a,b) => b.count - a.count));
  };

  const saveInstruction = async () => {
    if (!instruction.trim()) return;
    await DB.addInstruction(instruction.trim());
    setInstruction('');
    setInstructions(DB.getInstructions());
  };

  const saveGeminiKey = async () => {
    await AsyncStorage.setItem(KEYS.GEMINI_KEY, geminiKey.trim());
    setSavedKey(geminiKey.trim());
    setGeminiKey('');
    Alert.alert('✅ Connected!', 'Gemini AI enabled for smarter categorization. Completely free!');
  };

  const EXAMPLES = [
    '"Mom" transfers are always family transfers',
    '"Chaayos" is Eating Out, not Food Delivery',
    '"Zepto" orders above ₹500 are Groceries',
    'Sunday transactions are usually Eating Out',
  ];

  return (
    <ScrollView style={{ flex:1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      {/* Gemini card */}
      <View style={[s.geminiCard, savedKey && s.geminiCardActive]}>
        <View style={s.geminiCardLeft}>
          <Text style={s.geminiCardIcon}>🧠</Text>
          <View>
            <Text style={s.geminiCardTitle}>{savedKey ? 'AI Active — Gemini Connected' : 'Enable AI Categorization'}</Text>
            <Text style={s.geminiCardSub}>{savedKey ? 'Smart suggestions enabled' : 'Free Google Gemini API — 15 req/min'}</Text>
          </View>
        </View>
        {!savedKey && (
          <TouchableOpacity style={s.geminiSetupBtn} onPress={() => Alert.alert('Get Free API Key', '1. Go to aistudio.google.com\n2. Sign in with Google\n3. Click "Get API Key"\n4. Create API key\n5. Copy and paste below\n\nFree tier: 15 req/min, 1M tokens/day!')}>
            <Text style={s.geminiSetupBtnText}>How?</Text>
          </TouchableOpacity>
        )}
      </View>
      {!savedKey && (
        <View style={s.geminiInputRow}>
          <TextInput
            style={s.geminiInput}
            placeholder="Paste your Gemini API key..."
            placeholderTextColor={C.textTertiary}
            value={geminiKey} onChangeText={setGeminiKey}
            autoCapitalize="none" secureTextEntry
          />
          <TouchableOpacity style={s.geminiSaveBtn} onPress={saveGeminiKey} disabled={!geminiKey.trim()}>
            <Text style={s.geminiSaveBtnText}>Save</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tabs */}
      <View style={[s.tabRow, { marginHorizontal: 16 }]}>
        {['rules','instructions','learned'].map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab===t && s.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabBtnText, tab===t && s.tabBtnTextActive]}>
              {t === 'rules' ? 'Quick Rules' : t === 'instructions' ? 'Instructions' : 'What I Know'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'rules' && (
        <View style={{ padding: 16 }}>
          <Text style={s.fieldLabel}>Merchant name</Text>
          <TextInput
            style={s.fieldInput}
            placeholder="e.g. Chaayos, Mom, College canteen..."
            placeholderTextColor={C.textTertiary}
            value={merchantRule} onChangeText={setMerchantRule}
          />
          <Text style={s.fieldLabel}>Always categorize as...</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={[s.catChip, selectedCat === cat.id && { backgroundColor: cat.bg, borderColor: cat.color }]}
                onPress={() => setSelectedCat(cat.id)}
              >
                <Text style={s.catChipIcon}>{cat.icon}</Text>
                <Text style={[s.catChipText, selectedCat === cat.id && { color: cat.color, fontWeight: '600' }]}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={[s.saveBtn, (!merchantRule || !selectedCat) && { opacity: 0.4 }]}
            onPress={saveRule} disabled={!merchantRule || !selectedCat}
          >
            <Text style={s.saveBtnText}>Save Rule</Text>
          </TouchableOpacity>
        </View>
      )}

      {tab === 'instructions' && (
        <View style={{ padding: 16 }}>
          <View style={s.examplesBox}>
            <Text style={s.examplesLabel}>Try something like:</Text>
            {EXAMPLES.map((e, i) => (
              <TouchableOpacity key={i} onPress={() => setInstruction(e)} style={s.exampleItem}>
                <Text style={s.exampleText}>"{e}"</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={[s.fieldInput, { height: 90, textAlignVertical: 'top', marginTop: 12 }]}
            placeholder='Write any instruction for me...'
            placeholderTextColor={C.textTertiary}
            value={instruction} onChangeText={setInstruction} multiline
          />
          <TouchableOpacity style={[s.saveBtn, !instruction.trim() && { opacity: 0.4 }]} onPress={saveInstruction} disabled={!instruction.trim()}>
            <Text style={s.saveBtnText}>Save Instruction</Text>
          </TouchableOpacity>
          {instructions.map(ins => (
            <View key={ins.id} style={s.instructionRow}>
              <Text style={s.instructionText} numberOfLines={2}>{ins.text}</Text>
              <TouchableOpacity onPress={async () => { await DB.deleteInstruction(ins.id); setInstructions(DB.getInstructions()); }}>
                <Ionicons name="trash-outline" size={18} color={C.red} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {tab === 'learned' && (
        <View style={{ padding: 16 }}>
          <Text style={s.fieldLabel}>{rules.length} rules learned so far</Text>
          {rules.length === 0 ? (
            <View style={s.emptyCard}><Text style={s.emptyCardTitle}>No rules yet</Text><Text style={s.emptyCardSub}>Correct categorization mistakes and I'll learn!</Text></View>
          ) : rules.map((r, i) => {
            const cat = getCat(r.catId);
            return (
              <View key={i} style={s.ruleRow}>
                <Text style={s.ruleKey}>"{r.key}"</Text>
                <Ionicons name="arrow-forward" size={14} color={C.textTertiary} />
                <View style={[s.ruleCatPill, { backgroundColor: cat.bg }]}>
                  <Text style={[s.ruleCatText, { color: cat.color }]}>{cat.icon} {cat.name}</Text>
                </View>
                <Text style={s.ruleCount}>{r.count}×</Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

// ============================================================
// SETTINGS SCREEN
// ============================================================
function SettingsScreen({ navigation }) {
  const [balance, setBalance] = useState('');
  const [savedBalance, setSavedBalance] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEYS.BALANCE).then(b => setSavedBalance(b||''));
  }, []);

  const saveBalance = async () => {
    await AsyncStorage.setItem(KEYS.BALANCE, balance);
    setSavedBalance(balance);
    Alert.alert('Saved!', 'Starting balance updated.');
  };

  const clearAll = () => {
    Alert.alert('Clear All Data', 'This will delete ALL your transactions, rules, and settings. Cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete Everything', style: 'destructive', onPress: async () => {
        await AsyncStorage.multiRemove([KEYS.TXN, KEYS.RULES, KEYS.BUDGETS, KEYS.INSTRUCTIONS]);
        _txns = []; _rules = []; _budgets = []; _instructions = [];
        Alert.alert('Done', 'All data cleared.');
      }},
    ]);
  };

  const exportCSV = async () => {
    setExportLoading(true);
    const header = 'Date,Merchant,Category,Amount,Method,Note\n';
    const rows = _txns.map(t => {
      const cat = getCat(t.catId);
      return `${t.date ? format(new Date(t.date),'yyyy-MM-dd HH:mm') : ''},"${t.merchant||''}","${cat.name}",${t.amount||0},${t.method||''},${t.note ? `"${t.note}"` : ''}`;
    }).join('\n');
    const csv = header + rows;
    Alert.alert('CSV Export', `Your data (${_txns.length} transactions):\n\n${csv.slice(0, 300)}...\n\n(In a production build, this would save to your Files app)`);
    setExportLoading(false);
  };

  const settingsGroups = [
    {
      title: 'Account',
      items: [
        { icon: 'wallet-outline', label: 'Set Starting Balance', onPress: () => Alert.prompt('Starting Balance', 'Enter your wallet/account balance', [(text) => { setBalance(text||''); saveBalance(); }], 'plain-text', savedBalance, 'numeric') },
        { icon: 'pricetag-outline', label: 'Manage Budgets', onPress: () => navigation.navigate('Budgets') },
      ]
    },
    {
      title: 'Smart Features',
      items: [
        { icon: 'school-outline', label: 'Teach Paisa', onPress: () => navigation.navigate('Teach') },
        { icon: 'alert-circle-outline', label: 'Review Transactions', onPress: () => navigation.navigate('Review'), badge: DB.reviewCount() || null },
      ]
    },
    {
      title: 'Data',
      items: [
        { icon: 'download-outline', label: 'Export as CSV', onPress: exportCSV },
        { icon: 'trash-outline', label: 'Clear All Data', onPress: clearAll, danger: true },
      ]
    },
    {
      title: 'About',
      items: [
        { icon: 'information-circle-outline', label: 'Paisa v1.0', onPress: () => Alert.alert('Paisa', 'Built with ❤️ for smart expense tracking.\n\nAll data stored on your device — no servers, no subscriptions, completely private.') },
      ]
    }
  ];

  return (
    <ScrollView style={{ flex:1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 60 }}>
      {/* Stats card */}
      <View style={s.settingsStatsCard}>
        <View style={s.settingsStat}>
          <Text style={s.settingsStatVal}>{_txns.length}</Text>
          <Text style={s.settingsStatLbl}>Total Transactions</Text>
        </View>
        <View style={s.settingsDivider} />
        <View style={s.settingsStat}>
          <Text style={s.settingsStatVal}>{_rules.length}</Text>
          <Text style={s.settingsStatLbl}>Rules Learned</Text>
        </View>
        <View style={s.settingsDivider} />
        <View style={s.settingsStat}>
          <Text style={s.settingsStatVal}>{format(new Date(), "MMM yyyy")}</Text>
          <Text style={s.settingsStatLbl}>Since</Text>
        </View>
      </View>

      {settingsGroups.map(group => (
        <View key={group.title} style={s.settingsGroup}>
          <Text style={s.settingsGroupTitle}>{group.title}</Text>
          <View style={s.settingsGroupCard}>
            {group.items.map((item, i) => (
              <TouchableOpacity
                key={item.label}
                style={[s.settingsItem, i < group.items.length-1 && s.settingsItemBorder]}
                onPress={item.onPress}
              >
                <View style={s.settingsItemLeft}>
                  <View style={[s.settingsItemIcon, item.danger && { backgroundColor: C.redLight }]}>
                    <Ionicons name={item.icon} size={18} color={item.danger ? C.red : C.primary} />
                  </View>
                  <Text style={[s.settingsItemLabel, item.danger && { color: C.red }]}>{item.label}</Text>
                </View>
                <View style={s.settingsItemRight}>
                  {item.badge ? <View style={s.settingsBadge}><Text style={s.settingsBadgeText}>{item.badge}</Text></View> : null}
                  {!item.danger && <Ionicons name="chevron-forward" size={16} color={C.textTertiary} />}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ============================================================
// NAVIGATION
// ============================================================
const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const TAB_ICONS = {
  Home: ['home', 'home-outline'],
  Transactions: ['list', 'list-outline'],
  Insights: ['pie-chart', 'pie-chart-outline'],
  More: ['apps', 'apps-outline'],
};

function MoreScreen({ navigation }) {
  return (
    <ScrollView style={{ flex:1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 20 }}>
      {[
        { icon: '📊', title: 'Budgets', sub: 'Set monthly limits', screen: 'Budgets' },
        { icon: '🔍', title: 'Review', sub: 'Check unverified transactions', screen: 'Review' },
        { icon: '🧠', title: 'Teach Paisa', sub: 'Train the AI', screen: 'Teach' },
        { icon: '⚙️', title: 'Settings', sub: 'Preferences & data', screen: 'Settings' },
      ].map(item => (
        <TouchableOpacity key={item.screen} style={s.moreItem} onPress={() => navigation.navigate(item.screen)}>
          <Text style={s.moreItemIcon}>{item.icon}</Text>
          <View style={s.moreItemInfo}>
            <Text style={s.moreItemTitle}>{item.title}</Text>
            <Text style={s.moreItemSub}>{item.sub}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name];
          return <Ionicons name={focused ? icons[0] : icons[1]} size={size} color={color} />;
        },
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.textTertiary,
        tabBarStyle: {
          backgroundColor: C.white,
          borderTopColor: C.border,
          borderTopWidth: 0.5,
          height: 80,
          paddingBottom: 20,
          paddingTop: 10,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Transactions" component={AllTransactionsScreen} />
      <Tab.Screen name="Insights" component={InsightsScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}

// ============================================================
// APP ROOT
// ============================================================
export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    DB.init().then(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={{ flex:1, backgroundColor: C.bg, alignItems:'center', justifyContent:'center' }}>
        <Text style={{ fontSize: 40, marginBottom: 16 }}>💰</Text>
        <Text style={{ fontSize: 24, fontWeight: '800', color: C.text }}>Paisa</Text>
        <Text style={{ fontSize: 14, color: C.textSecondary, marginTop: 6 }}>Smart expense tracker</Text>
        <ActivityIndicator color={C.primary} style={{ marginTop: 30 }} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{
          headerStyle: { backgroundColor: C.bg, shadowColor: 'transparent', elevation: 0 },
          headerTintColor: C.primary,
          headerTitleStyle: { color: C.text, fontWeight: '700', fontSize: 17 },
          headerBackTitleVisible: false,
          contentStyle: { backgroundColor: C.bg },
        }}>
          <Stack.Screen name="Main" component={Tabs} options={{ headerShown: false }} />
          <Stack.Screen name="TxnDetail" component={TxnDetailScreen} options={{ title: 'Transaction' }} />
          <Stack.Screen name="AddExpense" component={AddExpenseScreen} options={{ title: 'Add Expense', presentation: 'modal' }} />
          <Stack.Screen name="CategoryDetail" component={CategoryDetailScreen} options={({ route }) => ({ title: getCat(route.params.catId).name })} />
          <Stack.Screen name="Review" component={ReviewScreen} options={{ title: 'Review Transactions' }} />
          <Stack.Screen name="Insights" component={InsightsScreen} options={{ title: 'Insights', headerShown: false }} />
          <Stack.Screen name="Budgets" component={BudgetsScreen} options={{ title: 'Budgets' }} />
          <Stack.Screen name="Teach" component={TeachScreen} options={{ title: 'Teach Paisa', presentation: 'modal' }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
          <Stack.Screen name="Notifications" component={ReviewScreen} options={{ title: 'Needs Review' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

// ============================================================
// STYLESHEET
// ============================================================
const s = StyleSheet.create({
  // Modal & sheets
  modalBackdrop: { flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'flex-end' },
  quickSheet: { backgroundColor:C.white, borderTopLeftRadius:28, borderTopRightRadius:28, padding:20, paddingBottom:34 },
  sheetHandle: { width:40, height:4, backgroundColor:C.border, borderRadius:2, alignSelf:'center', marginBottom:20 },
  quickAmtRow: { flexDirection:'row', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 },
  quickAmtLeft: {},
  quickAmtLabel: { fontSize:FONT.sm, color:C.textSecondary, fontWeight:'500' },
  quickAmt: { fontSize:FONT.xxl, fontWeight:'800', color:C.text, marginTop:2 },
  quickMerchant: { fontSize:FONT.base, color:C.textSecondary, marginTop:2 },
  methodPill: { paddingHorizontal:10, paddingVertical:4, borderRadius:20 },
  methodPillText: { fontSize:FONT.xs, fontWeight:'700' },
  transferRow: { flexDirection:'row', alignItems:'center', gap:10, padding:12, backgroundColor:C.bgMuted, borderRadius:14, marginBottom:16, borderWidth:1.5, borderColor:'transparent' },
  transferRowActive: { backgroundColor:C.primaryLight, borderColor:C.primary },
  transferRowIcon: { fontSize:20 },
  transferRowText: { flex:1, fontSize:FONT.sm, color:C.textSecondary, fontWeight:'500' },
  toggleDot: { width:22, height:22, borderRadius:11, backgroundColor:C.borderStrong },
  toggleDotActive: { backgroundColor:C.primary },
  quickLabel: { fontSize:FONT.sm, color:C.textSecondary, fontWeight:'600', marginBottom:8 },
  catScroll: { marginBottom:14 },
  catChip: { flexDirection:'row', alignItems:'center', gap:5, paddingHorizontal:12, paddingVertical:7, backgroundColor:C.bgMuted, borderRadius:20, marginRight:8, borderWidth:1.5, borderColor:'transparent' },
  catChipIcon: { fontSize:15 },
  catChipText: { fontSize:FONT.sm, color:C.textSecondary, fontWeight:'500' },
  noteInput: { backgroundColor:C.bgMuted, borderRadius:12, padding:12, fontSize:FONT.base, color:C.text, marginBottom:16 },
  quickActions: { flexDirection:'row', gap:10 },
  skipBtn: { flex:1, padding:14, borderRadius:14, backgroundColor:C.bgMuted, alignItems:'center' },
  skipBtnText: { fontSize:FONT.base, color:C.textSecondary, fontWeight:'600' },
  confirmBtn: { flex:2, padding:14, borderRadius:14, backgroundColor:C.primary, alignItems:'center' },
  confirmBtnText: { fontSize:FONT.base, color:C.white, fontWeight:'700' },

  // Home
  homeHeader: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:20, paddingBottom:12 },
  greeting: { fontSize:FONT.xl, fontWeight:'800', color:C.text },
  greetingSub: { fontSize:FONT.sm, color:C.textSecondary, marginTop:2 },
  headerRight: { flexDirection:'row', gap:8 },
  headerBtn: { width:40, height:40, borderRadius:20, backgroundColor:C.bgMuted, alignItems:'center', justifyContent:'center' },
  badge: { position:'absolute', top:0, right:0, backgroundColor:C.red, borderRadius:8, width:16, height:16, alignItems:'center', justifyContent:'center', zIndex:1 },
  badgeText: { fontSize:10, color:C.white, fontWeight:'800' },
  monthRow: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:16, paddingVertical:8 },
  monthArrow: { width:36, height:36, borderRadius:18, backgroundColor:C.primaryLight, alignItems:'center', justifyContent:'center' },
  monthLabel: { fontSize:FONT.md, fontWeight:'700', color:C.text, minWidth:140, textAlign:'center' },
  heroCard: { marginHorizontal:16, borderRadius:24, backgroundColor:C.primary, padding:24, marginBottom:16, shadowColor:C.primary, shadowOffset:{width:0,height:8}, shadowOpacity:0.25, shadowRadius:16, elevation:8 },
  heroTop: { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 },
  heroLabel: { fontSize:FONT.sm, color:'rgba(255,255,255,0.7)', fontWeight:'600' },
  heroAmt: { fontSize:FONT.hero, fontWeight:'800', color:C.white, marginTop:4 },
  heroRight: {},
  syncBtn: { flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'rgba(255,255,255,0.2)', paddingHorizontal:14, paddingVertical:8, borderRadius:20 },
  syncBtnText: { fontSize:FONT.sm, color:C.white, fontWeight:'600' },
  heroStats: { flexDirection:'row', backgroundColor:'rgba(255,255,255,0.15)', borderRadius:16, padding:14 },
  heroStat: { flex:1, alignItems:'center' },
  heroStatVal: { fontSize:FONT.md, fontWeight:'800', color:C.white },
  heroStatLbl: { fontSize:FONT.xs, color:'rgba(255,255,255,0.7)', marginTop:2 },
  heroStatDivider: { width:1, backgroundColor:'rgba(255,255,255,0.3)' },
  reviewBanner: { marginHorizontal:16, marginBottom:12, backgroundColor:C.amberLight, borderRadius:16, padding:14, flexDirection:'row', alignItems:'center', justifyContent:'space-between', borderWidth:1, borderColor:'#FFB30030' },
  reviewBannerLeft: { flexDirection:'row', alignItems:'center', gap:10 },
  reviewBannerIcon: { fontSize:22 },
  reviewBannerTitle: { fontSize:FONT.base, fontWeight:'700', color:C.amber },
  reviewBannerSub: { fontSize:FONT.sm, color:C.textSecondary },
  quickActionsRow: { flexDirection:'row', paddingHorizontal:16, gap:10, marginBottom:20 },
  qBtn: { flex:1, alignItems:'center', gap:6 },
  qBtnIcon: { width:52, height:52, borderRadius:16, alignItems:'center', justifyContent:'center' },
  qBtnLabel: { fontSize:FONT.xs, color:C.textSecondary, fontWeight:'600' },
  section: { paddingHorizontal:16, marginBottom:20 },
  sectionRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
  sectionTitle: { fontSize:FONT.md, fontWeight:'700', color:C.text },
  sectionLink: { fontSize:FONT.sm, color:C.primary, fontWeight:'600' },
  catGrid: { flexDirection:'row', flexWrap:'wrap', gap:10 },
  catCard: { flex:1, minWidth:'44%', borderRadius:18, padding:14 },
  catCardIcon: { fontSize:28, marginBottom:6 },
  catCardAmt: { fontSize:FONT.lg, fontWeight:'800' },
  catCardName: { fontSize:FONT.xs, color:C.textSecondary, fontWeight:'600', marginTop:2 },
  emptyCard: { backgroundColor:C.bgMuted, borderRadius:18, padding:30, alignItems:'center', marginVertical:8 },
  emptyCardIcon: { fontSize:42, marginBottom:12 },
  emptyCardTitle: { fontSize:FONT.md, fontWeight:'700', color:C.text, marginBottom:6 },
  emptyCardSub: { fontSize:FONT.sm, color:C.textSecondary, textAlign:'center', lineHeight:20 },
  fab: { position:'absolute', right:20, width:56, height:56, borderRadius:28, backgroundColor:C.primary, alignItems:'center', justifyContent:'center', shadowColor:C.primary, shadowOffset:{width:0,height:4}, shadowOpacity:0.3, shadowRadius:10, elevation:8 },

  // Transaction row
  txnRow: { flexDirection:'row', alignItems:'center', gap:12, paddingVertical:10, borderBottomWidth:0.5, borderBottomColor:C.border },
  txnIconWrap: { width:44, height:44, borderRadius:14, alignItems:'center', justifyContent:'center', position:'relative' },
  txnIcon: { fontSize:22 },
  txnReviewDot: { position:'absolute', top:0, right:0, width:10, height:10, borderRadius:5, backgroundColor:C.amber, borderWidth:2, borderColor:C.white },
  txnInfo: { flex:1 },
  txnMerchant: { fontSize:FONT.base, fontWeight:'600', color:C.text },
  txnMeta: { fontSize:FONT.xs, color:C.textTertiary, marginTop:2 },
  txnAmtWrap: {},
  txnAmt: { fontSize:FONT.base, fontWeight:'700' },

  // Search
  searchWrap: { flexDirection:'row', gap:10, padding:12, paddingBottom:4 },
  searchBox: { flex:1, flexDirection:'row', alignItems:'center', gap:8, backgroundColor:C.bgMuted, borderRadius:12, paddingHorizontal:12, height:40 },
  searchInput: { flex:1, fontSize:FONT.base, color:C.text },
  filterBtn: { width:40, height:40, borderRadius:12, backgroundColor:C.bgMuted, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:C.border },
  filterRow: { paddingHorizontal:12, paddingBottom:8, gap:8 },
  filterChip: { flexDirection:'row', alignItems:'center', gap:5, paddingHorizontal:12, paddingVertical:6, backgroundColor:C.bgMuted, borderRadius:20, borderWidth:1.5, borderColor:'transparent' },
  filterChipIcon: { fontSize:14 },
  filterChipText: { fontSize:FONT.sm, color:C.textSecondary, fontWeight:'500' },
  totalChip: { marginHorizontal:12, marginBottom:4, backgroundColor:C.bgMuted, borderRadius:8, paddingHorizontal:12, paddingVertical:6, alignSelf:'flex-start' },
  totalChipText: { fontSize:FONT.xs, color:C.textSecondary, fontWeight:'500' },
  dayHeader: { flexDirection:'row', justifyContent:'space-between', paddingHorizontal:16, paddingVertical:8, backgroundColor:C.bg },
  dayLabel: { fontSize:FONT.sm, fontWeight:'700', color:C.textSecondary },
  dayTotal: { fontSize:FONT.sm, fontWeight:'700', color:C.red },

  // Transaction detail
  detailHero: { margin:16, borderRadius:24, padding:24, alignItems:'center' },
  detailEmoji: { fontSize:48, marginBottom:8 },
  detailAmt: { fontSize:FONT.xxl+8, fontWeight:'800' },
  detailMerchant: { fontSize:FONT.lg, fontWeight:'700', color:C.text, marginTop:4 },
  detailDate: { fontSize:FONT.sm, color:C.textSecondary, marginTop:4 },
  detailCard: { marginHorizontal:16, backgroundColor:C.bgCard, borderRadius:18, overflow:'hidden', borderWidth:0.5, borderColor:C.border, marginBottom:16 },
  detailRow: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:14, borderBottomWidth:0.5, borderBottomColor:C.border },
  detailRowLeft: { flexDirection:'row', alignItems:'center', gap:8 },
  detailLabel: { fontSize:FONT.base, color:C.textSecondary },
  detailVal: { fontSize:FONT.base, fontWeight:'600', color:C.text },
  catPill: { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:10, paddingVertical:4, borderRadius:20 },
  catPillText: { fontSize:FONT.sm, fontWeight:'600' },
  fieldLabel: { fontSize:FONT.sm, fontWeight:'600', color:C.textSecondary, marginBottom:8, marginTop:4 },
  noteField: { backgroundColor:C.bgMuted, borderRadius:12, padding:12, fontSize:FONT.base, color:C.text, minHeight:80, textAlignVertical:'top', marginBottom:16 },
  rawSMSBtn: { flexDirection:'row', alignItems:'center', gap:6, alignSelf:'center', marginBottom:20, padding:8 },
  rawSMSText: { fontSize:FONT.sm, color:C.textSecondary },
  saveBtn: { backgroundColor:C.primary, borderRadius:14, padding:16, alignItems:'center', marginBottom:10 },
  saveBtnText: { fontSize:FONT.base, fontWeight:'700', color:C.white },
  deleteBtn: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, padding:14, borderRadius:14, borderWidth:1, borderColor:C.red },
  deleteBtnText: { fontSize:FONT.base, fontWeight:'600', color:C.red },

  // Category picker modal
  pickerSheet: { backgroundColor:C.white, borderTopLeftRadius:28, borderTopRightRadius:28, padding:20, paddingBottom:40 },
  pickerTitle: { fontSize:FONT.lg, fontWeight:'800', color:C.text, marginBottom:4 },
  pickerSub: { fontSize:FONT.sm, color:C.textSecondary, marginBottom:16 },
  pickerCat: { flex:1, margin:5, padding:12, backgroundColor:C.bgMuted, borderRadius:14, alignItems:'center', borderWidth:1.5, borderColor:'transparent' },
  pickerCatIcon: { fontSize:26, marginBottom:4 },
  pickerCatName: { fontSize:11, color:C.textSecondary, fontWeight:'600', textAlign:'center' },
  pickerClose: { backgroundColor:C.bgMuted, borderRadius:14, padding:14, alignItems:'center', marginTop:10 },
  pickerCloseText: { fontSize:FONT.base, fontWeight:'600', color:C.textSecondary },

  // Add expense
  amtCard: { margin:16, backgroundColor:C.primary, borderRadius:24, padding:24, alignItems:'center', shadowColor:C.primary, shadowOffset:{width:0,height:8}, shadowOpacity:0.25, shadowRadius:16, elevation:8 },
  amtCardLabel: { fontSize:FONT.sm, color:'rgba(255,255,255,0.7)', fontWeight:'600', marginBottom:8 },
  amtRow: { flexDirection:'row', alignItems:'center' },
  amtRupee: { fontSize:FONT.xxl, color:C.white, fontWeight:'800', marginRight:4, marginTop:6 },
  amtInput: { fontSize:FONT.hero, fontWeight:'800', color:C.white, minWidth:120, textAlign:'center' },
  methodRow: { flexDirection:'row', marginHorizontal:16, gap:8, marginBottom:20 },
  methodChip: { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:4, backgroundColor:C.bgMuted, borderRadius:12, paddingVertical:10, borderWidth:1.5, borderColor:'transparent' },
  methodChipIcon: { fontSize:16 },
  methodChipText: { fontSize:FONT.sm, color:C.textSecondary, fontWeight:'600' },
  fieldInput: { backgroundColor:C.bgMuted, borderRadius:12, padding:14, fontSize:FONT.base, color:C.text, marginBottom:16 },

  // Insights
  insightTotalCard: { margin:16, backgroundColor:C.primary, borderRadius:24, padding:24, alignItems:'center', shadowColor:C.primary, shadowOffset:{width:0,height:6}, shadowOpacity:0.2, shadowRadius:12, elevation:6 },
  insightTotalLabel: { fontSize:FONT.sm, color:'rgba(255,255,255,0.7)', fontWeight:'600' },
  insightTotalAmt: { fontSize:FONT.xxl+8, fontWeight:'800', color:C.white, marginTop:4 },
  insightTotalSub: { fontSize:FONT.sm, color:'rgba(255,255,255,0.7)', marginTop:4 },
  tabRow: { flexDirection:'row', backgroundColor:C.bgMuted, borderRadius:14, margin:16, padding:4 },
  tabBtn: { flex:1, paddingVertical:8, borderRadius:10, alignItems:'center' },
  tabBtnActive: { backgroundColor:C.white, shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.08, shadowRadius:4, elevation:2 },
  tabBtnText: { fontSize:FONT.sm, fontWeight:'600', color:C.textSecondary },
  tabBtnTextActive: { color:C.primary },
  chartCard: { backgroundColor:C.white, borderRadius:20, margin:16, padding:16, borderWidth:0.5, borderColor:C.border },
  chartTitle: { fontSize:FONT.sm, fontWeight:'700', color:C.textSecondary, marginBottom:12 },
  catBreakRow: { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingVertical:12, borderBottomWidth:0.5, borderBottomColor:C.border },
  catBreakIcon: { width:44, height:44, borderRadius:14, alignItems:'center', justifyContent:'center' },
  catBreakEmoji: { fontSize:22 },
  catBreakInfo: { flex:1 },
  catBreakTop: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:6 },
  catBreakName: { fontSize:FONT.base, fontWeight:'600', color:C.text },
  catBreakAmt: { fontSize:FONT.base, fontWeight:'700', color:C.text },
  catBarBg: { height:4, backgroundColor:C.bgMuted, borderRadius:2 },
  catBarFill: { height:4, borderRadius:2 },
  catBreakBottom: { flexDirection:'row', justifyContent:'space-between', marginTop:4 },
  catBreakPct: { fontSize:FONT.xs, color:C.textTertiary },
  catBreakBudget: { fontSize:FONT.xs, color:C.textTertiary },
  dailyRow: { flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:16, paddingVertical:8 },
  dailyDate: { fontSize:FONT.sm, color:C.textSecondary, width:90 },
  dailyBar: { height:6, backgroundColor:C.primaryLight, borderRadius:3, flex:1, maxWidth:'50%' },
  dailyAmt: { fontSize:FONT.sm, fontWeight:'600', color:C.text, minWidth:70, textAlign:'right' },
  compareRow: { flexDirection:'row', alignItems:'center', gap:10, marginBottom:12 },
  compareLabel: { fontSize:FONT.base, fontWeight:'700', color:C.text, width:36 },
  compareBarBg: { flex:1, height:8, backgroundColor:C.bgMuted, borderRadius:4 },
  compareBarFill: { height:8, backgroundColor:C.primary, borderRadius:4 },
  compareAmt: { fontSize:FONT.sm, fontWeight:'600', color:C.textSecondary, minWidth:70, textAlign:'right' },

  // Category detail
  catDetailHero: { padding:30, alignItems:'center' },
  catDetailEmoji: { fontSize:52, marginBottom:8 },
  catDetailName: { fontSize:FONT.lg, fontWeight:'700' },
  catDetailAmt: { fontSize:FONT.xxl+8, fontWeight:'800', color:C.text, marginTop:6 },
  catDetailSub: { fontSize:FONT.sm, color:C.textSecondary, marginTop:4 },
  budgetIndicator: { marginTop:10, backgroundColor:'rgba(255,255,255,0.7)', borderRadius:20, paddingHorizontal:14, paddingVertical:6 },
  budgetIndicatorText: { fontSize:FONT.sm, fontWeight:'600', color:C.text },

  // Review
  reviewHeader: { backgroundColor:C.amberLight, padding:16, margin:16, borderRadius:16 },
  reviewHeaderText: { fontSize:FONT.base, fontWeight:'600', color:C.amber },
  reviewCard: { backgroundColor:C.white, borderRadius:18, padding:16, marginBottom:10, borderWidth:0.5, borderColor:C.border },
  reviewCardTop: { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 },
  reviewMerchant: { fontSize:FONT.md, fontWeight:'700', color:C.text },
  reviewDate: { fontSize:FONT.xs, color:C.textTertiary, marginTop:2 },
  reviewAmt: { fontSize:FONT.xl, fontWeight:'800', color:C.red },
  reviewSMS: { fontSize:FONT.xs, color:C.textTertiary, fontStyle:'italic', backgroundColor:C.bgMuted, borderRadius:8, padding:8, marginBottom:10, lineHeight:18 },
  reviewGuessLabel: { fontSize:FONT.sm, color:C.textSecondary, marginBottom:10 },
  reviewGuessVal: { fontWeight:'700' },
  reviewActions: { flexDirection:'row', gap:10 },
  reviewApproveBtn: { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, backgroundColor:C.greenLight, borderRadius:12, padding:10, borderWidth:1, borderColor:C.green },
  reviewApproveTxt: { fontSize:FONT.sm, fontWeight:'600', color:C.green },
  reviewChangeBtn: { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, backgroundColor:C.primaryLight, borderRadius:12, padding:10, borderWidth:1, borderColor:C.primary },
  reviewChangeTxt: { fontSize:FONT.sm, fontWeight:'600', color:C.primary },

  // Budgets
  budgetHeader: { padding:16, paddingBottom:4 },
  budgetHeaderTitle: { fontSize:FONT.xl, fontWeight:'800', color:C.text },
  budgetHeaderSub: { fontSize:FONT.sm, color:C.textSecondary, marginTop:2 },
  budgetRow: { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingVertical:12, borderBottomWidth:0.5, borderBottomColor:C.border },
  budgetIcon: { width:44, height:44, borderRadius:14, alignItems:'center', justifyContent:'center' },
  budgetInfo: { flex:1 },
  budgetTop: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:6 },
  budgetCatName: { fontSize:FONT.base, fontWeight:'600', color:C.text },
  budgetAmts: { flexDirection:'row', alignItems:'baseline' },
  budgetSpent: { fontSize:FONT.base, fontWeight:'700', color:C.text },
  budgetLimit: { fontSize:FONT.sm, color:C.textSecondary },
  budgetBarBg: { height:4, backgroundColor:C.bgMuted, borderRadius:2, marginBottom:4 },
  budgetBarFill: { height:4, borderRadius:2 },
  budgetStatus: { fontSize:FONT.xs, color:C.textTertiary },
  budgetSetHint: { fontSize:FONT.xs, color:C.primary },
  budgetModal: { backgroundColor:C.white, borderRadius:24, margin:32, padding:24 },
  budgetModalTitle: { fontSize:FONT.lg, fontWeight:'800', color:C.text },
  budgetModalSub: { fontSize:FONT.sm, color:C.textSecondary, marginBottom:16 },
  budgetModalRow: { flexDirection:'row', alignItems:'center', gap:4, backgroundColor:C.bgMuted, borderRadius:14, padding:14, marginBottom:20 },
  budgetModalRupee: { fontSize:FONT.xl, fontWeight:'800', color:C.textSecondary },
  budgetModalInput: { flex:1, fontSize:FONT.xl, fontWeight:'800', color:C.text },
  budgetModalBtns: { flexDirection:'row', gap:10 },
  budgetModalCancel: { flex:1, backgroundColor:C.bgMuted, borderRadius:12, padding:14, alignItems:'center' },
  budgetModalCancelTxt: { fontSize:FONT.base, fontWeight:'600', color:C.textSecondary },
  budgetModalSave: { flex:1, backgroundColor:C.primary, borderRadius:12, padding:14, alignItems:'center' },
  budgetModalSaveTxt: { fontSize:FONT.base, fontWeight:'700', color:C.white },

  // Teach
  geminiCard: { margin:16, backgroundColor:C.bgMuted, borderRadius:20, padding:16, flexDirection:'row', alignItems:'center', justifyContent:'space-between', borderWidth:1.5, borderColor:'transparent' },
  geminiCardActive: { backgroundColor:C.greenLight, borderColor:C.green },
  geminiCardLeft: { flexDirection:'row', alignItems:'center', gap:12 },
  geminiCardIcon: { fontSize:28 },
  geminiCardTitle: { fontSize:FONT.base, fontWeight:'700', color:C.text },
  geminiCardSub: { fontSize:FONT.sm, color:C.textSecondary },
  geminiSetupBtn: { backgroundColor:C.primary, borderRadius:20, paddingHorizontal:14, paddingVertical:6 },
  geminiSetupBtnText: { fontSize:FONT.sm, fontWeight:'700', color:C.white },
  geminiInputRow: { flexDirection:'row', gap:10, paddingHorizontal:16, marginBottom:8 },
  geminiInput: { flex:1, backgroundColor:C.bgMuted, borderRadius:12, padding:12, fontSize:FONT.base, color:C.text },
  geminiSaveBtn: { backgroundColor:C.primary, borderRadius:12, paddingHorizontal:16, alignItems:'center', justifyContent:'center' },
  geminiSaveBtnText: { fontSize:FONT.sm, fontWeight:'700', color:C.white },
  examplesBox: { backgroundColor:C.bgMuted, borderRadius:14, padding:14, marginBottom:4 },
  examplesLabel: { fontSize:FONT.xs, fontWeight:'700', color:C.textTertiary, textTransform:'uppercase', letterSpacing:0.5, marginBottom:8 },
  exampleItem: { paddingVertical:5 },
  exampleText: { fontSize:FONT.sm, color:C.primary, fontStyle:'italic' },
  instructionRow: { flexDirection:'row', alignItems:'center', gap:10, paddingVertical:12, borderBottomWidth:0.5, borderBottomColor:C.border },
  instructionText: { flex:1, fontSize:FONT.base, color:C.text, lineHeight:20 },
  ruleRow: { flexDirection:'row', alignItems:'center', gap:8, paddingVertical:8, borderBottomWidth:0.5, borderBottomColor:C.border },
  ruleKey: { flex:1, fontSize:FONT.sm, color:C.textSecondary, fontStyle:'italic' },
  ruleCatPill: { paddingHorizontal:10, paddingVertical:4, borderRadius:20 },
  ruleCatText: { fontSize:FONT.xs, fontWeight:'600' },
  ruleCount: { fontSize:FONT.xs, color:C.textTertiary },

  // Settings
  settingsStatsCard: { margin:16, backgroundColor:C.primary, borderRadius:20, padding:20, flexDirection:'row' },
  settingsStat: { flex:1, alignItems:'center' },
  settingsStatVal: { fontSize:FONT.xl, fontWeight:'800', color:C.white },
  settingsStatLbl: { fontSize:FONT.xs, color:'rgba(255,255,255,0.7)', marginTop:2 },
  settingsDivider: { width:1, backgroundColor:'rgba(255,255,255,0.3)' },
  settingsGroup: { marginHorizontal:16, marginBottom:20 },
  settingsGroupTitle: { fontSize:FONT.xs, fontWeight:'700', color:C.textTertiary, textTransform:'uppercase', letterSpacing:0.8, marginBottom:8, paddingLeft:4 },
  settingsGroupCard: { backgroundColor:C.white, borderRadius:18, overflow:'hidden', borderWidth:0.5, borderColor:C.border },
  settingsItem: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:14 },
  settingsItemBorder: { borderBottomWidth:0.5, borderBottomColor:C.border },
  settingsItemLeft: { flexDirection:'row', alignItems:'center', gap:12 },
  settingsItemIcon: { width:36, height:36, borderRadius:10, backgroundColor:C.primaryLight, alignItems:'center', justifyContent:'center' },
  settingsItemLabel: { fontSize:FONT.base, fontWeight:'500', color:C.text },
  settingsItemRight: { flexDirection:'row', alignItems:'center', gap:6 },
  settingsBadge: { backgroundColor:C.amber, borderRadius:12, paddingHorizontal:8, paddingVertical:2 },
  settingsBadgeText: { fontSize:FONT.xs, color:C.white, fontWeight:'700' },

  // More screen
  moreItem: { flexDirection:'row', alignItems:'center', gap:14, backgroundColor:C.white, borderRadius:18, padding:16, marginBottom:10, borderWidth:0.5, borderColor:C.border },
  moreItemIcon: { fontSize:28 },
  moreItemInfo: { flex:1 },
  moreItemTitle: { fontSize:FONT.md, fontWeight:'700', color:C.text },
  moreItemSub: { fontSize:FONT.sm, color:C.textSecondary, marginTop:2 },
});
