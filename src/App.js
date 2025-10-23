import React, { useEffect, useState, useMemo } from "react";
import {
  initializeApp,
  getApps,
  getApp,
} from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import * as XLSX from "xlsx";
import "./App.css";

const firebaseConfig = {
  apiKey: "AIzaSyCHv-swPrzkKKQxuB0nZG-jQ4s4ecrbLUw",
  authDomain: "web-4de0f.firebaseapp.com",
  projectId: "web-4de0f",
  storageBucket: "web-4de0f.appspot.com",
  messagingSenderId: "766258113961",
  appId: "1:766258113961:web:b085d899d1d640998fa8b8",
};

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function SalaryApp() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);
  const [month, setMonth] = useState(getCurrentMonth());
  const [users, setUsers] = useState([]);
  const [pricePerBook, setPricePerBook] = useState(3.5);
  const [newUserName, setNewUserName] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [inputBooks, setInputBooks] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ==== INIT FIREBASE ====
  useEffect(() => {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    setDb(getFirestore(app));
    setAuth(getAuth(app));
  }, []);

  // ==== AUTH ====
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, [auth]);

  const login = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      alert("❌ Sai tài khoản hoặc mật khẩu!");
    }
  };
  const logout = async () => await signOut(auth);

  // ==== FIRESTORE LISTEN ====
  useEffect(() => {
    if (!db || !user) return;
    const path = `users/${user.uid}/months/${month}/data`;
    const unsub = onSnapshot(collection(db, path), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setUsers(data);
    });
    return () => unsub();
  }, [db, month, user]);

  // ==== TÍNH TỔNG ====
  const totalBooks = useMemo(
    () => users.reduce((s, u) => s + (u.days || []).reduce((a, b) => a + b, 0), 0),
    [users]
  );
  const totalMoney = useMemo(
    () => Math.round(totalBooks * pricePerBook * 1000),
    [totalBooks, pricePerBook]
  );

  // ==== CRUD ====
  const addNewUser = async () => {
    if (!newUserName.trim() || !user) return;
    const id = `${newUserName}_${Date.now()}`;
    const ref = doc(db, `users/${user.uid}/months/${month}/data`, id);
    await setDoc(ref, { name: newUserName, days: Array(31).fill(0) });
    setNewUserName("");
  };

  const deleteUser = async (id) => {
    if (window.confirm("🗑️ Xóa nhân viên này?")) {
      await deleteDoc(doc(db, `users/${user.uid}/months/${month}/data`, id));
    }
  };

  const addEntry = async () => {
    if (!user || !selectedUser || !selectedDay || inputBooks === "")
      return alert("⚠️ Chưa đủ thông tin!");
    const day = parseInt(selectedDay);
    const books = parseInt(inputBooks);
    const docRef = doc(db, `users/${user.uid}/months/${month}/data`, selectedUser);
    const target = users.find((u) => u.id === selectedUser);
    const newDays = [...(target?.days || Array(31).fill(0))];
    newDays[day - 1] += books;
    await updateDoc(docRef, { days: newDays });
    setInputBooks("");
  };

  const editCell = async (userId, dayIndex) => {
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    const cur = target.days?.[dayIndex] || 0;
    const newVal = prompt(`✏️ Nhập lại số sổ ngày ${dayIndex + 1} (hiện tại: ${cur})`, cur);
    if (newVal === null) return;
    const num = newVal === "" ? 0 : parseInt(newVal) || 0;
    const updated = [...target.days];
    updated[dayIndex] = num;
    await updateDoc(doc(db, `users/${user.uid}/months/${month}/data`, userId), { days: updated });
  };

  // ==== XUẤT EXCEL ====
  const exportExcel = () => {
    const header = ["Họ và Tên", ...Array.from({ length: 31 }, (_, i) => `Ngày ${i + 1}`), "Tổng Sổ", "Tiền (VND)"];
    const rows = users.map((u) => {
      const days = u.days || Array(31).fill(0);
      const sum = days.reduce((a, b) => a + b, 0);
      const money = Math.round(sum * pricePerBook * 1000);
      return [u.name, ...days, sum, money];
    });
    const totalRow = ["TỔNG", ...Array(31).fill(""), totalBooks, totalMoney];
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows, totalRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, month);
    XLSX.writeFile(wb, `luong_${month}.xlsx`);
  };

  const formatVND = (v) => v.toLocaleString("vi-VN") + " ₫";

  // ==== LOGIN UI ====
  if (!user)
    return (
      <div className="login-page">
        <div className="login-box">
          <h2>🔐 Đăng nhập hệ thống</h2>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mật khẩu"
          />
          <button onClick={login} className="btn-primary">Đăng nhập</button>
        </div>
      </div>
    );

  // ==== MAIN UI ====
  return (
    <div className="dashboard">
      <div className="topbar">
        <h1>📊 Quản Lý Lương Theo Sổ</h1>
        <div className="user-info">
          <span>{user.email}</span>
          <button onClick={logout} className="btn-logout">Đăng xuất</button>
        </div>
      </div>

      <div className="toolbar">
        <label>Tháng:</label>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <label>Giá/sổ:</label>
        <input
          type="number"
          value={pricePerBook}
          onChange={(e) => setPricePerBook(parseFloat(e.target.value) || 0)}
          className="short-input"
        />
        <button onClick={exportExcel} className="btn-secondary">⬇️ Xuất Excel</button>
      </div>

      <div className="section">
        <h2>👥 Danh sách nhân viên</h2>
        <div className="add-row">
          <input
            placeholder="Nhập tên nhân viên"
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNewUser()}
          />
          <button onClick={addNewUser} className="btn-primary">➕ Thêm</button>
        </div>
        <div className="tag-list">
          {users.map((u) => (
            <div key={u.id} className="tag">
              <span>{u.name}</span>
              <button onClick={() => deleteUser(u.id)}>✕</button>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <h2>📝 Nhập sổ theo ngày</h2>
        <div className="form-row">
          <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}>
            <option value="">--Chọn người--</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
            <option value="">--Ngày--</option>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Số sổ"
            value={inputBooks}
            onChange={(e) => setInputBooks(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addEntry()}
          />
          <button onClick={addEntry} className="btn-success">➕ Thêm</button>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Tên</th>
              {Array.from({ length: 31 }, (_, i) => <th key={i}>{i + 1}</th>)}
              <th>Tổng</th>
              <th>Tiền (VND)</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const days = u.days || Array(31).fill(0);
              const total = days.reduce((a, b) => a + b, 0);
              const money = Math.round(total * pricePerBook * 1000);
              return (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  {days.map((d, i) => (
                    <td key={i} onClick={() => editCell(u.id, i)}>{d || "-"}</td>
                  ))}
                  <td>{total}</td>
                  <td>{formatVND(money)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="summary">
        <div><b>Tổng số sổ:</b> {totalBooks}</div>
        <div><b>Tổng tiền:</b> {formatVND(totalMoney)}</div>
      </div>
    </div>
  );
}
