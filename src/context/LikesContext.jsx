import React, { createContext, useContext, useState, useEffect } from 'react';

const LikesContext = createContext();

export const LikesProvider = ({ children }) => {
  const [likedEvents, setLikedEvents] = useState(() => {
    try {
      const saved = localStorage.getItem('eventpass_likes');
      return saved ? JSON.parse(saved) : ['live-sa-tour-2026', 'franschhoek-car-festival-2026'];
    } catch {
      return ['live-sa-tour-2026'];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('eventpass_likes', JSON.stringify(likedEvents));
    } catch {}
  }, [likedEvents]);

  const toggleLike = (eventId) => {
    setLikedEvents((prev) =>
      prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId]
    );
  };

  const isLiked = (eventId) => likedEvents.includes(eventId);

  return (
    <LikesContext.Provider value={{ likedEvents, toggleLike, isLiked, count: likedEvents.length }}>
      {children}
    </LikesContext.Provider>
  );
};

export const useLikes = () => useContext(LikesContext);
