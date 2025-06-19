import React from 'react';

const Calendar = ({ activities, month, year, onActivityClick }) => {
  // Get all days in month
  const getDaysInMonth = (month, year) => {
    return new Date(year, month + 1, 0).getDate();
  };

  // Get first day of month (0 = Sunday, 1 = Monday, etc.)
  const getFirstDayOfMonth = (month, year) => {
    return new Date(year, month, 1).getDay();
  };

  const daysInMonth = getDaysInMonth(month, year);
  const firstDayOfMonth = getFirstDayOfMonth(month, year);
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Group activities by day
  const activitiesByDay = {};
  activities.forEach(activity => {
    const date = new Date(activity.startDate);
    if (date.getMonth() === month && date.getFullYear() === year) {
      const day = date.getDate();
      if (!activitiesByDay[day]) {
        activitiesByDay[day] = [];
      }
      activitiesByDay[day].push(activity);
    }
  });

  // Render calendar grid
  const renderCalendar = () => {
    const days = [];
    const totalCells = Math.ceil((daysInMonth + firstDayOfMonth) / 7) * 7;
    
    // Add empty cells for days before the 1st of the month
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dayActivities = activitiesByDay[day] || [];
      
      days.push(
        <div key={`day-${day}`} className={`calendar-day ${dayActivities.length ? 'has-activities' : ''}`}>
          <div className="day-number">{day}</div>
          <div className="day-activities">
            {dayActivities.map(activity => (
              <div 
                key={activity.id} 
                className={`activity ${activity.type.toLowerCase()} ${activity.isMock ? 'mock' : ''} ${activity.isIndoor ? 'indoor' : ''} ${activity.isCommute ? 'commute' : ''}`}
                onClick={() => onActivityClick(activity)}
              >
                <div className="activity-name">
                  {activity.isMock && <span className="mock-badge">Test</span>} 
                  {activity.isIndoor && <span className="indoor-badge">🏠</span>}
                  {activity.isCommute && <span className="commute-badge">🚲</span>}
                  {activity.name}
                </div>
                <div className="activity-stats">
                  {activity.distance && <span>{(activity.distance / 1000).toFixed(2)} km</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    
    // Add empty cells for days after the last day of the month
    for (let i = days.length; i < totalCells; i++) {
      days.push(<div key={`empty-end-${i}`} className="calendar-day empty"></div>);
    }
    
    return days;
  };

  return (
    <div className="calendar-container">
      <h3>{monthNames[month]} {year}</h3>
      <div className="calendar-header">
        <div>Sun</div>
        <div>Mon</div>
        <div>Tue</div>
        <div>Wed</div>
        <div>Thu</div>
        <div>Fri</div>
        <div>Sat</div>
      </div>
      <div className="calendar-grid">
        {renderCalendar()}
      </div>
    </div>
  );
};

export default Calendar;