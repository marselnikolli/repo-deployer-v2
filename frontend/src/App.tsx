import React from 'react'
import { Toaster } from 'react-hot-toast'
import { HomePage } from './pages/HomePage'
import './App.css'

function App() {
  return (
    <>
      <HomePage />
      <Toaster position="top-right" />
    </>
  )
}

export default App
