// src/App.js
import { useState } from 'react';
import { SearchBar } from './components/SearchBar';
import { SafetyScore } from './components/SafetyScore';
import { AccessibilityScore } from './components/AccessibilityScore';
import { ConvenienceScore } from './components/ConvenienceScore';
import { TransportInfo } from './components/TransportInfo';
import { Hero } from './components/Hero';
import { SafetyHeatMap } from './components/SafetyHeatMap';
import { Header } from './components/Header';
import { LocationSidebar } from './components/LocationSidebar';
import { ComparisonView } from './components/ComparisonView';
import { Button } from './components/ui/button';
import { LayoutGrid, List } from 'lucide-react';

// 실제 API 호출 함수 (기존 테스트용 앱에서 쓰던 것)
import { fetchStayScore } from './api/stayScore';

function detectCityByLatLng(lat, lng) {
  if (lat > 41 && lat < 42.5 && lng < -87 && lng > -88.5) return "Chicago";
  if (lat > 37 && lat < 38 && lng > 126 && lng < 128) return "Seoul";
  return "Other";
}


export default function App() {
  const [savedLocations, setSavedLocations] = useState([]);
  const [currentSearchResult, setCurrentSearchResult] = useState(null);
  // -1이면 검색 결과를 보고 있다는 의미
  const [activeLocationIndex, setActiveLocationIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState('single'); // 'single' | 'compare'

  const handleSearch = async (location) => {
    setIsLoading(true);
  
    try {
      // 1) 기존 stay-score API
      const apiResult = await fetchStayScore(location);
  
      const lat =
        apiResult?.query?.lat !== undefined
          ? apiResult.query.lat
          : 37.5665;
      const lng =
        apiResult?.query?.lng !== undefined
          ? apiResult.query.lng
          : 126.9780;
  
      // 2) ✅ 새 안전 점수 기본값
      let safetyScore = 75;
      let safetyGrade = "B";
  
      const city = detectCityByLatLng(lat, lng);
  
      // 3) 시카고이면 백엔드 안전 점수 API 호출
      if (city === "Chicago") {
        try {
          const res = await fetch(
            `http://localhost:4000/api/safety/chicago/point?lat=${lat}&lng=${lng}`
          );
          if (res.ok) {
            const data = await res.json();
            safetyScore = data.score;   // 0~100
            safetyGrade = data.grade;   // A/B/C/D
          } else {
            console.warn("safety/chicago/point not ok:", res.status);
          }
        } catch (err) {
          console.error("safety score API error:", err);
        }
      } else {
        // 4) 나중에 서울/기타 로직도 여기서 분기 가능
        // 지금은 기본값 유지 (75점 / B등급)
      }
  
      // 5) 기존 mockData에서 safetyScore / safetyGrade만 교체
      const mockData = {
        location,
        safetyScore,
        safetyGrade,
        accessibilityScore: Math.floor(Math.random() * 40) + 60,
        accessibilityTime: ['10분', '15분', '20분', '25분'][
          Math.floor(Math.random() * 4)
        ],
        convenienceScore: Math.floor(Math.random() * 30) + 70,
        nearbyFacilities: [
          { name: '편의점', count: Math.floor(Math.random() * 10) + 3 },
          { name: '약국', count: Math.floor(Math.random() * 5) + 1 },
          { name: '병원', count: Math.floor(Math.random() * 3) + 1 },
          { name: '경찰서', count: Math.floor(Math.random() * 2) + 1 },
        ],
        nearestStation: {
          name: `${location.split(' ')[0]}역 2번 출구`,
          distance: `${Math.floor(Math.random() * 500) + 100}m`,
          walkTime: `${Math.floor(Math.random() * 10) + 3}분`,
          interval: '3-5분',
          nightService: Math.random() > 0.3,
        },
        lat,
        lng,
      };
  
      setCurrentSearchResult(mockData);
      setActiveLocationIndex(-1);
      setViewMode('single');
    } catch (error) {
      console.error('stayScore API 호출 에러:', error);
      alert('위치 분석 중 오류가 발생했습니다. 나중에 다시 시도해 주세요.');
    } finally {
      setIsLoading(false);
    }
  };
  

  const handleGoHome = () => {
    setSavedLocations([]);
    setCurrentSearchResult(null);
    setActiveLocationIndex(-1);
    setViewMode('single');
  };

  const handleAddToSidebar = () => {
    if (currentSearchResult) {
      setSavedLocations((prev) => [...prev, currentSearchResult]);
    }
  };

  const handleCloseTab = (index) => {
    const newLocations = savedLocations.filter((_, i) => i !== index);
    setSavedLocations(newLocations);

    if (activeLocationIndex >= newLocations.length) {
      setActiveLocationIndex(Math.max(-1, newLocations.length - 1));
    }
    if (newLocations.length === 0) {
      setViewMode('single');
    }
  };

  const handleTabClick = (index) => {
    setActiveLocationIndex(index);
    setViewMode('single');
  };

  const displayLocation =
    activeLocationIndex >= 0
      ? savedLocations[activeLocationIndex]
      : currentSearchResult;

  const isAlreadyAdded =
    currentSearchResult &&
    savedLocations.some((loc) => loc.location === currentSearchResult.location);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {!currentSearchResult && savedLocations.length === 0 ? (
        <div className="max-w-7xl mx-auto px-4 py-8">
          <Hero onSearch={handleSearch} isLoading={isLoading} />
        </div>
      ) : (
        <div className="flex h-screen overflow-hidden">
          <LocationSidebar
            locations={savedLocations}
            activeIndex={activeLocationIndex}
            onTabClick={handleTabClick}
            onAddTab={handleAddToSidebar}
            onCloseTab={handleCloseTab}
          />

          <div className="flex-1 overflow-y-auto">
            <Header onLogoClick={handleGoHome} />

            <div className="max-w-7xl mx-auto px-8 py-8">
              <div className="mb-8 flex items-center gap-4">
                <div className="flex-1">
                  <SearchBar
                    onSearch={handleSearch}
                    isLoading={isLoading}
                    initialValue={displayLocation?.location || ''}
                  />
                </div>

                {activeLocationIndex === -1 &&
                  currentSearchResult &&
                  !isAlreadyAdded && (
                    <Button
                      onClick={handleAddToSidebar}
                      className="h-12 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                    >
                      <List className="w-4 h-4 mr-2" />
                      이 장소 추가
                    </Button>
                  )}

                {activeLocationIndex === -1 && isAlreadyAdded && (
                  <div className="h-12 px-4 flex items-center bg-gray-100 rounded-lg text-gray-600">
                    ✓ 이미 추가됨
                  </div>
                )}

                {savedLocations.length > 1 && (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setViewMode('single')}
                      variant={viewMode === 'single' ? 'default' : 'outline'}
                      className="h-12"
                    >
                      <List className="w-4 h-4 mr-2" />
                      상세보기
                    </Button>
                    <Button
                      onClick={() => setViewMode('compare')}
                      variant={viewMode === 'compare' ? 'default' : 'outline'}
                      className="h-12"
                    >
                      <LayoutGrid className="w-4 h-4 mr-2" />
                      비교하기
                    </Button>
                  </div>
                )}
              </div>

              {viewMode === 'compare' && savedLocations.length > 1 ? (
                <ComparisonView locations={savedLocations} />
              ) : displayLocation ? (
                <>
                  <div className="mb-6">
                    <h2 className="text-gray-900 mb-2">
                      {displayLocation.location}
                    </h2>
                    <p className="text-gray-600">
                      여행 안전 및 생활 편의 인텔리전스 분석 결과
                    </p>
                  </div>

                  <div className="mb-6">
                    <SafetyHeatMap
                      location={displayLocation.location}
                      safetyScore={displayLocation.safetyScore}
                      lat={displayLocation.lat}
                      lng={displayLocation.lng}
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <SafetyScore
                      score={displayLocation.safetyScore}
                      grade={displayLocation.safetyGrade}
                    />
                    <AccessibilityScore
                      score={displayLocation.accessibilityScore}
                      time={displayLocation.accessibilityTime}
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ConvenienceScore
                      score={displayLocation.convenienceScore}
                      facilities={displayLocation.nearbyFacilities}
                    />
                    <TransportInfo station={displayLocation.nearestStation} />
                  </div>
                </>
              ) : (
                <div className="text-center py-20">
                  <div className="text-gray-400 mb-4">🔍</div>
                  <h3 className="text-gray-900 mb-2">장소를 검색해주세요</h3>
                  <p className="text-gray-600">
                    위 검색창에 분석하고 싶은 장소를 입력하세요
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
