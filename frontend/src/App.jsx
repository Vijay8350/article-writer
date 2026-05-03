import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import BusinessDna from './pages/BusinessDna';
import GenerateArticle from './pages/GenerateArticle';
import ExistingArticles from './pages/ExistingArticles';
import Settings from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="/business-dna" element={<BusinessDna />} />
        <Route path="/generate" element={<GenerateArticle />} />
        <Route path="/articles" element={<ExistingArticles />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
