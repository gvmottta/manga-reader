import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import InputPage from "./pages/InputPage";
import ComicDetailPage from "./pages/ComicDetailPage";
import ReaderPage from "./pages/ReaderPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<InputPage />} />
          <Route path="/comic/:id" element={<ComicDetailPage />} />
          <Route path="/comic/:id/read/:chapterId" element={<ReaderPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
