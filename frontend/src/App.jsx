import { createContext, useContext, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Pipeline from './pages/Pipeline'
import AccountList from './pages/AccountList'
import AccountDetail from './pages/AccountDetail'
import EntryLog from './pages/EntryLog'
import NewEntry from './pages/NewEntry'
import Chat from './pages/Chat'
import Settings from './pages/Settings'
import Analytics from './pages/Analytics'

export const UserContext = createContext(null)

export function useUser() {
  return useContext(UserContext)
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gtm_user')) } catch { return null }
  })

  function selectUser(user) {
    setCurrentUser(user)
    localStorage.setItem('gtm_user', JSON.stringify(user))
  }

  return (
    <UserContext.Provider value={{ currentUser, selectUser }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="accounts" element={<AccountList />} />
            <Route path="accounts/:id" element={<AccountDetail />} />
            <Route path="log" element={<EntryLog />} />
            <Route path="log/new" element={<NewEntry />} />
            <Route path="chat" element={<Chat />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </UserContext.Provider>
  )
}
