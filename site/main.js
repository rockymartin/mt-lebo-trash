(function () {
  const streetInput = document.getElementById('street-input');
  const results = document.getElementById('results');
  const autocompleteList = document.getElementById('autocomplete-list');

  // Street to weekday mapping (0=Sunday, 1=Monday, etc.)
  const dayToWeekday = {
    'Monday': 1,
    'Tuesday': 2,
    'Wednesday': 3,
    'Thursday': 4,
    'Friday': 5
  };

  // Holiday dates for 2025 (when holidays fall on weekdays, pickup is pushed back 1 day)
  const holidays = [
    { name: "New Year's Day", month: 0, day: 1 }, // January 1
    { name: "Memorial Day", month: 4, day: 26 }, // Last Monday in May (2025)
    { name: "Independence Day", month: 6, day: 4 }, // July 4
    { name: "Labor Day", month: 8, day: 1 }, // First Monday in September (2025)
    { name: "Thanksgiving Day", month: 10, day: 27 }, // Fourth Thursday in November (2025)
    { name: "Christmas Day", month: 11, day: 25 } // December 25
  ];

  // Street schedule data - will be loaded from CSV
  let streetSchedule = {};
  let allStreets = []; // Array to store all street variants

  // Load street schedule data from CSV
  async function loadStreetSchedule() {
    try {
      const response = await fetch('/data/street-schedule.csv');
      const csvText = await response.text();
      const lines = csvText.split('\n');
      
      for (let i = 1; i < lines.length; i++) { // Skip header
        const line = lines[i].trim();
        if (line) {
          const [street, day] = line.split(',');
          if (street && day) {
            // Store each street variant with its day
            allStreets.push({ street, day });
            // Also store normalized version for exact matching
            streetSchedule[street.toLowerCase()] = day;
          }
        }
      }
    } catch (error) {
      console.error('Error loading street schedule:', error);
    }
  }

  // Common street type abbreviations
  const streetAbbreviations = {
    'ave': 'avenue',
    'av': 'avenue', 
    'blvd': 'boulevard',
    'cir': 'circle',
    'ct': 'court',
    'dr': 'drive',
    'ln': 'lane',
    'pl': 'place',
    'rd': 'road',
    'st': 'street',
    'tr': 'trail',
    'trl': 'trail',
    'way': 'way',
    'pkwy': 'parkway',
    'pky': 'parkway'
  };

  // Normalize street name for better matching (ignores numbers in addresses)
  function normalizeStreetName(streetName) {
    let normalized = streetName.trim().toLowerCase();
    
    // Remove numbers (address numbers) - keep only letters, spaces, and common punctuation
    normalized = normalized.replace(/^\d+\s*/, ''); // Remove leading numbers
    normalized = normalized.replace(/\s+\d+\s*$/, ''); // Remove trailing numbers
    normalized = normalized.replace(/\s+\d+\s+/g, ' '); // Remove middle numbers
    
    // Handle common abbreviations
    for (const [abbrev, full] of Object.entries(streetAbbreviations)) {
      // Replace abbreviation with full word
      normalized = normalized.replace(new RegExp(`\\b${abbrev}\\b`, 'g'), full);
    }
    
    // Remove extra spaces and common prefixes
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    return normalized;
  }

  // Format street name with proper capitalization
  function formatStreetName(streetName) {
    const titleCase = (w) => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w;

    // Split into segments, preserving parenthetical groups
    const segments = streetName.split(/(\([^\)]*\))/g);

    const formatted = segments.map((segment) => {
      if (!segment) return segment;
      // If this is a parenthetical segment like "(Cedar to Washington)"
      if (segment.startsWith('(') && segment.endsWith(')')) {
        const inner = segment.slice(1, -1);
        const innerWords = inner.split(/\s+/).map((word) => {
          return word.toLowerCase() === 'to' ? 'to' : titleCase(word);
        });
        return '(' + innerWords.join(' ') + ')';
      }
      // Outside parentheses - simple title case per word
      return segment
        .split(/\s+/)
        .map(titleCase)
        .join(' ');
    }).join('');

    return formatted.replace(/\s+/g, ' ').trim();
  }

  function getPickupRuleForStreet(streetName) {
    if (!streetName) return null;
    
    // Simple case-insensitive exact match against the CSV data
    for (const { street, day } of allStreets) {
      if (street.toLowerCase() === streetName.toLowerCase()) {
        return { weekday: dayToWeekday[day], day };
      }
    }
    
    return null; // No exact match found
  }

  // Get all matching streets for autocomplete
  function getAllMatchingStreets(query) {
    const normalizedQuery = normalizeStreetName(query);
    const matches = [];

    for (const { street, day } of allStreets) {
      if (street.toLowerCase().includes(normalizedQuery)) {
        matches.push({ street, day });
      }
    }

    // Sort by relevance (exact matches first, then by length)
    matches.sort((a, b) => {
      const aExact = a.street.toLowerCase().startsWith(normalizedQuery);
      const bExact = b.street.toLowerCase().startsWith(normalizedQuery);
      
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      return a.street.length - b.street.length;
    });

    return matches;
  }

  // Check if a date is a holiday that affects pickup
  function isHolidayAffectingPickup(date) {
    const month = date.getMonth();
    const day = date.getDate();
    const weekday = date.getDay();
    
    // Only weekdays (Monday-Friday) affect pickup
    if (weekday === 0 || weekday === 6) return false;
    
    return holidays.some(holiday => 
      holiday.month === month && holiday.day === day
    );
  }

  // Get the adjusted pickup day considering holidays
  function getAdjustedPickupDay(date, originalWeekday) {
    const month = date.getMonth();
    const day = date.getDate();
    const weekday = date.getDay();
    
    // Only check for holidays if this is actually a pickup day
    if (weekday !== originalWeekday) {
      return originalWeekday;
    }
    
    // Check if there's a holiday on this pickup day or earlier in the week
    // that would cause pickup to be pushed back
    for (let i = 0; i <= weekday; i++) {
      const checkDate = new Date(date);
      checkDate.setDate(day - i);
      
      if (isHolidayAffectingPickup(checkDate)) {
        // Holiday found on or before pickup day - pickup is pushed back 1 day
        return (originalWeekday + 1) % 7;
      }
    }
    
    return originalWeekday;
  }

  // Determine if a week is trash-only or trash+recycling
  // Week 1 of the year is trash-only, then alternates every other week
  function isRecyclingWeek(date) {
    // Calculate week number based on the week containing January 1st
    const year = date.getFullYear();
    const jan1 = new Date(year, 0, 1);
    
    // Find the start of the week containing January 1st (Sunday)
    const dayOfWeek = jan1.getDay();
    const daysToWeekStart = dayOfWeek; // Sunday = 0, so no adjustment needed
    const weekStart = new Date(year, 0, 1 - daysToWeekStart);
    
    // Calculate which week of the year this date falls in
    const timeDiff = date.getTime() - weekStart.getTime();
    const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const weekNumber = Math.floor(daysDiff / 7) + 1;
    
    // Week 1 (containing Jan 1) is trash-only (false), then alternates
    return weekNumber % 2 === 0;
  }

  function buildCalendar(year, month, pickupWeekday) {
    const first = new Date(year, month, 1);
    const days = new Date(year, month + 1, 0).getDate();
    const elems = [];
    
    // Add day of week headers
    const dayHeaders = ['S', 'M', 'T', 'W', 'Th', 'F', 'S'];
    dayHeaders.forEach(day => {
      const header = document.createElement('div');
      header.className = 'day-header';
      header.textContent = day;
      elems.push(header);
    });
    
    // Add empty cells for days before the first day of the month
    const firstDayOfWeek = first.getDay();
    for (let i = 0; i < firstDayOfWeek; i++) {
      const empty = document.createElement('div');
      empty.className = 'day empty';
      elems.push(empty);
    }
    
    // Add calendar days
    for (let d = 1; d <= days; d++) {
      const date = new Date(year, month, d);
      const weekday = date.getDay();
      const isHoliday = isHolidayAffectingPickup(date);
      const isRecycling = isRecyclingWeek(date);
      
      // Check if this is a pickup day (original or adjusted)
      let isPickup = false;
      let isAdjustedPickup = false;
      
      if (weekday === pickupWeekday) {
        // Check if there's a holiday this week that would push back pickup
        let hasHolidayBeforePickup = false;
        for (let i = 0; i <= weekday; i++) {
          const checkDate = new Date(date);
          checkDate.setDate(d - i);
          if (isHolidayAffectingPickup(checkDate)) {
            hasHolidayBeforePickup = true;
            break;
          }
        }
        
        if (hasHolidayBeforePickup) {
          // Pickup is pushed back to next day
          isAdjustedPickup = true;
        } else {
          // Normal pickup day
          isPickup = true;
        }
      } else if (weekday === (pickupWeekday + 1) % 7) {
        // Check if this is an adjusted pickup day (pushed back from previous day)
        const prevDate = new Date(date);
        prevDate.setDate(d - 1);
        if (prevDate.getDay() === pickupWeekday) {
          // Check if there was a holiday that pushed pickup back
          let hasHolidayBeforePickup = false;
          for (let i = 0; i <= pickupWeekday; i++) {
            const checkDate = new Date(prevDate);
            checkDate.setDate(prevDate.getDate() - i);
            if (isHolidayAffectingPickup(checkDate)) {
              hasHolidayBeforePickup = true;
              break;
            }
          }
          
          if (hasHolidayBeforePickup) {
            isPickup = true;
            isAdjustedPickup = true;
          }
        }
      }
      
      // Check if this is today's date
      const today = new Date();
      const isToday = date.getDate() === today.getDate() && 
                     date.getMonth() === today.getMonth() && 
                     date.getFullYear() === today.getFullYear();
      
      const el = document.createElement('div');
      el.className = 'day' + 
                    (isPickup ? ' pickup' : '') + 
                    (isHoliday ? ' holiday' : '') + 
                    (isPickup && isRecycling ? ' recycling' : '') +
                    (isToday ? ' today' : '');
      el.textContent = String(d);
      
      // Add tooltips
      if (isHoliday) {
        const holiday = holidays.find(h => h.month === month && h.day === d);
        if (holiday) {
          el.title = holiday.name + ' - Pickup pushed back 1 day';
        }
      } else if (isPickup) {
        if (isAdjustedPickup) {
          el.title = (isRecycling ? 'Trash & Recycling Collection' : 'Trash Collection Only') + ' (Adjusted for holiday)';
        } else {
          el.title = isRecycling ? 'Trash & Recycling Collection' : 'Trash Collection Only';
        }
      }
      
      elems.push(el);
    }
    return elems;
  }

  // Create export button helper
  function createExportButton(text, icon, onClick) {
    const button = document.createElement('button');
    button.innerHTML = `${icon} ${text}`;
    button.style.padding = '8px 16px';
    button.style.background = 'var(--accent)';
    button.style.color = 'var(--bg)';
    button.style.border = 'none';
    button.style.borderRadius = '6px';
    button.style.fontWeight = '600';
    button.style.cursor = 'pointer';
    button.style.fontSize = '13px';
    button.style.flex = '1';
    button.style.minWidth = '120px';
    button.onclick = onClick;
    return button;
  }

  // Export to Google Calendar
  function exportToGoogleCalendar(streetName, pickupWeekday, year) {
    const events = generateCalendarEvents(streetName, pickupWeekday, year);
    const googleUrl = generateGoogleCalendarUrl(events, streetName);
    window.open(googleUrl, '_blank');
  }

  // Export to iCal (.ics file) - generates custom calendar with user's reminder settings
  function exportToICal(streetName, pickupWeekday, year) {
    // Get user's reminder preferences
    const reminderDays = parseInt(document.getElementById('reminder-time')?.value || '1');
    const reminderHour = parseInt(document.getElementById('reminder-hour')?.value || '18');
    
    // Generate events with custom reminder settings
    const events = generateCalendarEvents(streetName, pickupWeekday, year);
    const icsContent = generateICSWithCustomReminder(events, reminderDays, reminderHour);
    
    // Create download link
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `mt-lebo-trash-${streetName.toLowerCase().replace(/\s+/g, '-')}-${year}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Print calendar in print-friendly format
  function printCalendar(streetName, pickupWeekday, year) {
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    
    // Generate print-friendly HTML
    const printHTML = generatePrintHTML(streetName, pickupWeekday, year);
    
    printWindow.document.write(printHTML);
    printWindow.document.close();
    
    // Wait for content to load, then print
    printWindow.onload = function() {
      printWindow.print();
      printWindow.close();
    };
  }

  // Generate print-friendly HTML for calendar
  function generatePrintHTML(streetName, pickupWeekday, year) {
    const currentMonth = new Date().getMonth();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Mt. Lebo Trash Collection - ${streetName}</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 0; 
            padding: 20px; 
            background: white; 
            color: black;
        }
        .print-header { 
            text-align: center; 
            margin-bottom: 30px; 
            border-bottom: 2px solid #333; 
            padding-bottom: 15px;
        }
        .print-header h1 { 
            margin: 0 0 10px 0; 
            font-size: 24px; 
            color: #333;
        }
        .print-header p { 
            margin: 0; 
            font-size: 16px; 
            color: #666;
        }
        .calendar-container { 
            display: flex; 
            flex-wrap: wrap; 
            gap: 20px; 
            justify-content: center;
        }
        .month-calendar { 
            width: 300px; 
            margin-bottom: 20px;
        }
        .month-title { 
            text-align: center; 
            font-size: 18px; 
            font-weight: bold; 
            margin-bottom: 10px; 
            color: #333;
        }
        .print-calendar { 
            display: grid; 
            grid-template-columns: repeat(7, 1fr); 
            gap: 2px; 
            border: 1px solid #333;
        }
        .print-day-header { 
            background: #f0f0f0; 
            padding: 8px 4px; 
            text-align: center; 
            font-weight: bold; 
            font-size: 12px; 
            border: 1px solid #ccc;
        }
        .print-day { 
            padding: 8px 4px; 
            text-align: center; 
            font-size: 12px; 
            border: 1px solid #ccc; 
            min-height: 30px; 
            display: flex; 
            align-items: center; 
            justify-content: center;
        }
        .print-day.pickup { 
            background: #f0f0f0; 
            border: 2px solid #333; 
            font-weight: bold;
        }
        .print-day.recycling { 
            background: #e0e0e0; 
            border: 2px solid #666;
            position: relative;
        }
        .print-day.recycling::after {
            content: '♻';
            position: absolute;
            top: 1px;
            right: 1px;
            font-size: 12px;
        }
        .print-day.today { 
            background: #d0d0d0; 
            border: 2px solid #000; 
            font-weight: bold;
        }
        .print-day.holiday { 
            background: #f5f5f5; 
            border: 1px solid #999;
            position: relative;
        }
        .print-day.holiday::after {
            content: '★';
            position: absolute;
            top: 1px;
            right: 1px;
            font-size: 10px;
        }
        .print-day.empty { 
            background: #fafafa; 
            color: #ccc;
        }
        .legend { 
            margin-top: 20px; 
            text-align: center; 
            font-size: 12px;
        }
        .legend-item { 
            display: inline-block; 
            margin: 0 10px;
        }
        .legend-symbol { 
            display: inline-block; 
            width: 16px; 
            height: 16px; 
            margin-right: 8px; 
            text-align: center;
            line-height: 16px;
            font-size: 10px;
            font-weight: bold;
        }
        @media print {
            body { margin: 0; padding: 10px; }
            .calendar-container { gap: 15px; }
            @page { 
                margin: 0.5in; 
                @bottom-center { content: ""; }
                @top-center { content: ""; }
                @bottom-left { content: ""; }
                @bottom-right { content: ""; }
                @top-left { content: ""; }
                @top-right { content: ""; }
            }
        }
    </style>
</head>
<body>
    <div class="print-header">
        <h1>Mt. Lebo Trash Collection</h1>
        <p>${streetName} - ${dayNames[pickupWeekday]} Pickup</p>
    </div>
    <div class="calendar-container">`;

    // Generate calendars for each month from current month to December
    for (let month = currentMonth; month < 12; month++) {
      html += generatePrintMonthCalendar(year, month, pickupWeekday, monthNames[month]);
    }

    html += `
    </div>
        <div class="legend">
            <div class="legend-item">
                <span class="legend-symbol" style="background: #f0f0f0; border: 2px solid #333;">■</span>
                Trash Collection
            </div>
            <div class="legend-item">
                <span class="legend-symbol" style="background: #e0e0e0; border: 2px solid #666; font-size: 12px;">♻</span>
                Trash & Recycling
            </div>
            <div class="legend-item">
                <span class="legend-symbol" style="background: #f5f5f5; border: 1px solid #999;">★</span>
                Holiday
            </div>
        </div>
        <div style="margin-top: 20px; text-align: center; font-size: 10px; color: #666;">
            Information sourced from https://mtlebanon.org/residents/public-works/garbage/
        </div>
</body>
</html>`;

    return html;
  }

  // Generate print-friendly calendar for a single month
  function generatePrintMonthCalendar(year, month, pickupWeekday, monthName) {
    const first = new Date(year, month, 1);
    const days = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = first.getDay();
    const today = new Date();
    
    let html = `
    <div class="month-calendar">
        <div class="month-title">${monthName} ${year}</div>
        <div class="print-calendar">
            <div class="print-day-header">S</div>
            <div class="print-day-header">M</div>
            <div class="print-day-header">T</div>
            <div class="print-day-header">W</div>
            <div class="print-day-header">T</div>
            <div class="print-day-header">F</div>
            <div class="print-day-header">S</div>`;

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDayOfWeek; i++) {
      html += '<div class="print-day empty"></div>';
    }

    // Add calendar days
    for (let d = 1; d <= days; d++) {
      const date = new Date(year, month, d);
      const weekday = date.getDay();
      // Check if this is any holiday (not just pickup-affecting ones)
      const isHoliday = holidays.some(holiday => 
        holiday.month === month && holiday.day === d
      );
      const isRecycling = isRecyclingWeek(date);
      // Don't highlight today in print version - it should be static
      const isToday = false;
      
      // Check if this is a pickup day (original or adjusted)
      let isPickup = false;
      let isAdjustedPickup = false;
      
      if (weekday === pickupWeekday) {
        // Check if there's a holiday this week that would push back pickup
        let hasHolidayBeforePickup = false;
        for (let i = 0; i <= weekday; i++) {
          const checkDate = new Date(date);
          checkDate.setDate(d - i);
          if (isHolidayAffectingPickup(checkDate)) {
            hasHolidayBeforePickup = true;
            break;
          }
        }
        
        if (hasHolidayBeforePickup) {
          isAdjustedPickup = true;
        } else {
          isPickup = true;
        }
      } else if (weekday === (pickupWeekday + 1) % 7) {
        // Check if this is an adjusted pickup day (pushed back from previous day)
        const prevDate = new Date(date);
        prevDate.setDate(d - 1);
        if (prevDate.getDay() === pickupWeekday) {
          let hasHolidayBeforePickup = false;
          for (let i = 0; i <= pickupWeekday; i++) {
            const checkDate = new Date(prevDate);
            checkDate.setDate(prevDate.getDate() - i);
            if (isHolidayAffectingPickup(checkDate)) {
              hasHolidayBeforePickup = true;
              break;
            }
          }
          
          if (hasHolidayBeforePickup) {
            isPickup = true;
            isAdjustedPickup = true;
          }
        }
      }

      let dayClass = 'print-day';
      if (isPickup) dayClass += ' pickup';
      if (isPickup && isRecycling) dayClass += ' recycling';
      if (isToday) dayClass += ' today';
      if (isHoliday) dayClass += ' holiday';

      html += `<div class="${dayClass}">${d}</div>`;
    }

    html += `
        </div>
    </div>`;

    return html;
  }


  // Export to Outlook
  function exportToOutlook(streetName, pickupWeekday, year) {
    const events = generateCalendarEvents(streetName, pickupWeekday, year);
    const outlookUrl = generateOutlookUrl(events);
    window.open(outlookUrl, '_blank');
  }

  // Generate calendar events data
  function generateCalendarEvents(streetName, pickupWeekday, year) {
    const events = [];
    const currentMonth = new Date().getMonth();
    
    // Generate events for current month and remaining months only
    for (let month = currentMonth; month < 12; month++) {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const weekday = date.getDay();
        const isRecycling = isRecyclingWeek(date);
        
        // Check if this is a pickup day (original or adjusted)
        let isPickup = false;
        let isAdjustedPickup = false;
        
        if (weekday === pickupWeekday) {
          // Check if there's a holiday this week that would push back pickup
          let hasHolidayBeforePickup = false;
          for (let i = 0; i <= weekday; i++) {
            const checkDate = new Date(date);
            checkDate.setDate(day - i);
            if (isHolidayAffectingPickup(checkDate)) {
              hasHolidayBeforePickup = true;
              break;
            }
          }
          
          if (hasHolidayBeforePickup) {
            // Pickup is pushed back to next day
            isAdjustedPickup = true;
          } else {
            // Normal pickup day
            isPickup = true;
          }
        } else if (weekday === (pickupWeekday + 1) % 7) {
          // Check if this is an adjusted pickup day (pushed back from previous day)
          const prevDate = new Date(date);
          prevDate.setDate(day - 1);
          if (prevDate.getDay() === pickupWeekday) {
            // Check if there was a holiday that pushed pickup back
            let hasHolidayBeforePickup = false;
            for (let i = 0; i <= pickupWeekday; i++) {
              const checkDate = new Date(prevDate);
              checkDate.setDate(prevDate.getDate() - i);
              if (isHolidayAffectingPickup(checkDate)) {
                hasHolidayBeforePickup = true;
                break;
              }
            }
            
            if (hasHolidayBeforePickup) {
              isPickup = true;
              isAdjustedPickup = true;
            }
          }
        }
        
        if (isPickup) {
          const eventDate = new Date(year, month, day);
          const title = isRecycling ? 
            `🗑️♻️ Trash & Recycling Collection` : 
            `🗑️ Trash Collection`;
          
          const description = isAdjustedPickup ? 
            'Collection day adjusted due to holiday' : 
            (isRecycling ? 'Trash and recycling collection' : 'Trash collection only');
          
          events.push({
            title,
            description,
            date: eventDate,
            isRecycling,
            isAdjusted: isAdjustedPickup
          });
        }
      }
    }
    
    return events;
  }

  // Generate Google Calendar URL
  function generateGoogleCalendarUrl(events, streetName) {
    // For Google Calendar, we'll create multiple individual events
    // Since Google Calendar doesn't easily support complex patterns, we'll create all events
    if (events.length === 0) return 'https://calendar.google.com/calendar/render';
    
    // Create a batch of events - Google Calendar can handle multiple events in one URL
    const eventUrls = events.map(event => {
      const startDate = event.date.toISOString().split('T')[0].replace(/-/g, '');
      const endDate = new Date(event.date.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0].replace(/-/g, '');
      
      const params = new URLSearchParams({
        text: event.title,
        dates: `${startDate}/${endDate}`,
        details: event.description,
        location: 'Mt. Lebanon, PA',
        ctz: 'America/New_York'
      });
      
      return `https://calendar.google.com/calendar/render?action=TEMPLATE&${params.toString()}`;
    });
    
    // For now, return the first event URL since Google Calendar doesn't support batch creation via URL
    // Users can download the ICS file for all events
    return eventUrls[0];
  }

  // Generate Outlook URL
  function generateOutlookUrl(events) {
    const baseUrl = 'https://outlook.live.com/calendar/0/deeplink/compose';
    if (events.length === 0) return baseUrl;
    
    // For Outlook, we'll create the first event URL since it doesn't support batch creation
    // Users can download the ICS file for all events
    const firstEvent = events[0];
    const startDate = firstEvent.date.toISOString();
    const endDate = new Date(firstEvent.date.getTime() + 24 * 60 * 60 * 1000).toISOString();
    
    const params = new URLSearchParams({
      subject: firstEvent.title,
      startdt: startDate,
      enddt: endDate,
      body: firstEvent.description,
      location: 'Mt. Lebanon, PA'
    });
    
    return `${baseUrl}?${params.toString()}`;
  }

  // Export calendar events to ICS format (legacy function)
  function exportToCalendar(streetName, pickupWeekday, year) {
    const events = [];
    const currentMonth = new Date().getMonth();
    
    // Generate events for current month and remaining months
    for (let month = currentMonth; month < 12; month++) {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const weekday = date.getDay();
        const isRecycling = isRecyclingWeek(date);
        
        // Check if this is a pickup day (original or adjusted)
        let isPickup = false;
        let isAdjustedPickup = false;
        
        if (weekday === pickupWeekday) {
          // Check if there's a holiday this week that would push back pickup
          let hasHolidayBeforePickup = false;
          for (let i = 0; i <= weekday; i++) {
            const checkDate = new Date(date);
            checkDate.setDate(day - i);
            if (isHolidayAffectingPickup(checkDate)) {
              hasHolidayBeforePickup = true;
              break;
            }
          }
          
          if (hasHolidayBeforePickup) {
            // Pickup is pushed back to next day
            isAdjustedPickup = true;
          } else {
            // Normal pickup day
            isPickup = true;
          }
        } else if (weekday === (pickupWeekday + 1) % 7) {
          // Check if this is an adjusted pickup day (pushed back from previous day)
          const prevDate = new Date(date);
          prevDate.setDate(day - 1);
          if (prevDate.getDay() === pickupWeekday) {
            // Check if there was a holiday that pushed pickup back
            let hasHolidayBeforePickup = false;
            for (let i = 0; i <= pickupWeekday; i++) {
              const checkDate = new Date(prevDate);
              checkDate.setDate(prevDate.getDate() - i);
              if (isHolidayAffectingPickup(checkDate)) {
                hasHolidayBeforePickup = true;
                break;
              }
            }
            
            if (hasHolidayBeforePickup) {
              isPickup = true;
              isAdjustedPickup = true;
            }
          }
        }
        
        if (isPickup) {
          const eventDate = new Date(year, month, day);
          const title = isRecycling ? 
            `🗑️♻️ Trash & Recycling Collection` : 
            `🗑️ Trash Collection`;
          
          const description = isAdjustedPickup ? 
            'Collection day adjusted due to holiday' : 
            (isRecycling ? 'Trash and recycling collection' : 'Trash collection only');
          
          events.push({
            title,
            description,
            date: eventDate,
            isRecycling,
            isAdjusted: isAdjustedPickup
          });
        }
      }
    }
    
    // Generate ICS content
    const icsContent = generateICS(events);
    
    // Download the file
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `mt-lebo-trash-${formatStreetName(streetName).replace(/\s+/g, '-').toLowerCase()}-${year}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Generate ICS calendar content
  function generateICS(events) {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    
    let ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Mt. Lebo Trash//Trash Collection Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ];
    
    events.forEach(event => {
      const dateStr = event.date.toISOString().split('T')[0].replace(/-/g, '');
      const uid = `trash-${dateStr}-${Math.random().toString(36).substr(2, 9)}@mtlebotrash.com`;
      
      // Calculate reminder time (7PM the day before)
      const reminderDate = new Date(event.date);
      reminderDate.setDate(reminderDate.getDate() - 1);
      reminderDate.setHours(19, 0, 0, 0); // 7:00 PM
      const reminderStr = reminderDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      
      ics.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${timestamp}`,
        `DTSTART;VALUE=DATE:${dateStr}`,
        `DTEND;VALUE=DATE:${dateStr}`,
        `SUMMARY:${event.title}`,
        `DESCRIPTION:${event.description}`,
        'STATUS:CONFIRMED',
        'TRANSP:TRANSPARENT',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `TRIGGER;VALUE=DATE-TIME:${reminderStr}`,
        'DESCRIPTION:Reminder: Trash collection tomorrow',
        'END:VALARM',
        'END:VEVENT'
      );
    });
    
    ics.push('END:VCALENDAR');
    return ics.join('\r\n');
  }

  // Generate ICS calendar content with custom reminder settings
  function generateICSWithCustomReminder(events, reminderDays, reminderHour) {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    
    let ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Mt. Lebo Trash//Trash Collection Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ];
    
    events.forEach(event => {
      const dateStr = event.date.toISOString().split('T')[0].replace(/-/g, '');
      const uid = `trash-${dateStr}-${Math.random().toString(36).substr(2, 9)}@mtlebotrash.com`;
      
      // Calculate reminder time based on user preferences
      const reminderDate = new Date(event.date);
      reminderDate.setDate(reminderDate.getDate() - reminderDays);
      reminderDate.setHours(reminderHour, 0, 0, 0);
      const reminderStr = reminderDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      
        // Create reminder description (always 1 day before)
        const reminderDescription = 'Reminder: Trash collection tomorrow';
      
      ics.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${timestamp}`,
        `DTSTART;VALUE=DATE:${dateStr}`,
        `DTEND;VALUE=DATE:${dateStr}`,
        `SUMMARY:${event.title}`,
        `DESCRIPTION:${event.description}`,
        'STATUS:CONFIRMED',
        'TRANSP:TRANSPARENT',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `TRIGGER;VALUE=DATE-TIME:${reminderStr}`,
        `DESCRIPTION:${reminderDescription}`,
        'END:VALARM',
        'END:VEVENT'
      );
    });
    
    ics.push('END:VCALENDAR');
    return ics.join('\r\n');
  }

  function renderCalendar(streetName) {
    results.innerHTML = '';
    
    if (!streetName.trim()) {
      results.innerHTML = '<div class="card"><p>Please enter a street name to find your collection day.</p></div>';
      return;
    }
    
    const rule = getPickupRuleForStreet(streetName);
    if (!rule) {
      results.innerHTML = `
        <div class="card">
          <h2>Street Not Found</h2>
          <p>We couldn't find "${streetName}" in our database.</p>
          <p><strong>Tips:</strong></p>
          <ul style="text-align: left; margin: 16px 0;">
            <li>Try using common abbreviations (Dr, Ave, St, etc.)</li>
            <li>Check your spelling</li>
            <li>Try just the main part of the street name</li>
            <li>Use the autocomplete suggestions as you type</li>
          </ul>
          <p>If you believe this is an error, please contact the Mt. Lebanon Municipality.</p>
        </div>
      `;
      return;
    }

    const now = new Date();
    const year = now.getFullYear();
    const currentMonth = now.getMonth();

    const container = document.createElement('div');
    container.className = 'card';
    const title = document.createElement('h2');
    title.textContent = `Trash Collection Calendar for ${formatStreetName(streetName)}`;
    const dayInfo = document.createElement('p');
    dayInfo.textContent = `Collection Day: ${rule.day}`;
    dayInfo.style.color = 'var(--accent)';
    dayInfo.style.fontWeight = '600';
    dayInfo.style.marginBottom = '16px';
    
    // Add recycling schedule legend
    const legend = document.createElement('div');
    legend.style.marginBottom = '16px';
    legend.style.padding = '12px';
    legend.style.background = 'rgba(255, 255, 255, 0.05)';
    legend.style.borderRadius = '8px';
    legend.style.fontSize = '14px';
    legend.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <div style="width: 20px; height: 20px; background: rgba(34, 197, 94, 0.2); border: 1px solid rgba(34, 197, 94, 0.4); border-radius: 4px; position: relative;">
          <span style="position: absolute; top: 2px; right: 2px; font-size: 10px;">♻️</span>
        </div>
        <span><strong>Trash & Recycling</strong> - Every other week (even weeks)</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 20px; height: 20px; background: var(--accent); border-radius: 4px;"></div>
        <span><strong>Trash Only</strong> - Every other week (odd weeks)</span>
      </div>
    `;

    // Add export section
    const exportSection = document.createElement('div');
    exportSection.style.marginBottom = '16px';
    exportSection.style.padding = '16px';
    exportSection.style.background = 'rgba(255, 255, 255, 0.05)';
    exportSection.style.borderRadius = '8px';
    exportSection.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    
    const exportTitle = document.createElement('h3');
    exportTitle.textContent = '📅 Add to Calendar';
    exportTitle.style.margin = '0 0 12px 0';
    exportTitle.style.color = 'var(--text)';
    exportTitle.style.fontSize = '16px';
    
    const exportDescription = document.createElement('p');
    exportDescription.style.margin = '0 0 12px 0';
    exportDescription.style.color = 'var(--muted)';
    exportDescription.style.fontSize = '14px';
    exportDescription.innerHTML = 'Download a <strong>personalized calendar file</strong> with your custom reminder settings. The calendar includes events from the current month through December 2025 and works with Google Calendar, Apple Calendar, Outlook, and any other calendar app.';
    
    const exportButtons = document.createElement('div');
    exportButtons.className = 'export-buttons';
    exportButtons.style.display = 'flex';
    exportButtons.style.gap = '8px';
    exportButtons.style.flexWrap = 'wrap';
    
    // Download calendar file button
    const calendarButton = createExportButton('📥 Download Calendar Events', '', () => exportToICal(streetName, rule.weekday, year));
    calendarButton.style.background = 'var(--accent)';
    calendarButton.style.fontWeight = '700';
    calendarButton.style.flex = '1';
    calendarButton.style.minWidth = '200px';
    
    // Print calendar button
    const printButton = createExportButton('🖨️ Print Calendar', '', () => printCalendar(streetName, rule.weekday, year));
    printButton.style.background = 'rgba(255, 255, 255, 0.1)';
    printButton.style.color = 'var(--text)';
    printButton.style.flex = '1';
    printButton.style.minWidth = '200px';
    
    exportButtons.appendChild(calendarButton);
    exportButtons.appendChild(printButton);
    
    // Add reminder customization section
    const reminderSection = document.createElement('div');
    reminderSection.style.marginTop = '16px';
    reminderSection.style.padding = '16px';
    reminderSection.style.background = 'rgba(255, 255, 255, 0.05)';
    reminderSection.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    reminderSection.style.borderRadius = '8px';
    
    const reminderTitle = document.createElement('h4');
    reminderTitle.textContent = '⏰ Set Reminder Time';
    reminderTitle.style.margin = '0 0 12px 0';
    reminderTitle.style.color = 'var(--text)';
    reminderTitle.style.fontSize = '16px';
    
    const reminderControls = document.createElement('div');
    reminderControls.style.display = 'flex';
    reminderControls.style.gap = '12px';
    reminderControls.style.alignItems = 'center';
    reminderControls.style.flexWrap = 'wrap';
    
    const reminderLabel = document.createElement('label');
    reminderLabel.textContent = 'Remind me 1 day before pickup at:';
    reminderLabel.style.color = 'var(--text)';
    reminderLabel.style.fontWeight = '500';
    
    const timeSelect = document.createElement('select');
    timeSelect.id = 'reminder-hour';
    timeSelect.style.padding = '8px 12px';
    timeSelect.style.borderRadius = '6px';
    timeSelect.style.border = '1px solid rgba(255, 255, 255, 0.2)';
    timeSelect.style.background = 'rgba(255, 255, 255, 0.1)';
    timeSelect.style.color = 'var(--text)';
    timeSelect.style.fontSize = '14px';
    
    // Add time options (12-hour format with AM/PM)
    const timeOptions = [
      { value: '6', text: '6:00 AM' },
      { value: '7', text: '7:00 AM' },
      { value: '8', text: '8:00 AM' },
      { value: '9', text: '9:00 AM' },
      { value: '10', text: '10:00 AM' },
      { value: '11', text: '11:00 AM' },
      { value: '12', text: '12:00 PM' },
      { value: '13', text: '1:00 PM' },
      { value: '14', text: '2:00 PM' },
      { value: '15', text: '3:00 PM' },
      { value: '16', text: '4:00 PM' },
      { value: '17', text: '5:00 PM' },
      { value: '18', text: '6:00 PM' },
      { value: '19', text: '7:00 PM' },
      { value: '20', text: '8:00 PM' },
      { value: '21', text: '9:00 PM' }
    ];
    
    timeOptions.forEach(option => {
      const optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.text;
      if (option.value === '18') optionElement.selected = true; // Default to 6:00 PM
      timeSelect.appendChild(optionElement);
    });
    
    reminderControls.appendChild(reminderLabel);
    reminderControls.appendChild(timeSelect);
    
    reminderSection.appendChild(reminderTitle);
    reminderSection.appendChild(reminderControls);
    
    exportSection.appendChild(exportTitle);
    exportSection.appendChild(exportDescription);
    exportSection.appendChild(exportButtons);
    exportSection.appendChild(reminderSection);

    container.appendChild(title);
    container.appendChild(dayInfo);
    container.appendChild(legend);
    container.appendChild(exportSection);

    // Generate calendars for current month and remaining months only
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    
    for (let month = currentMonth; month < 12; month++) {
      const monthContainer = document.createElement('div');
      monthContainer.style.marginBottom = '24px';
      
      const monthTitle = document.createElement('h3');
      monthTitle.textContent = monthNames[month];
      monthTitle.style.color = 'var(--text)';
      monthTitle.style.marginBottom = '12px';
      monthTitle.style.fontSize = '18px';
      
      // Check if there are holidays this month that affect pickup
      const monthHolidays = holidays.filter(h => h.month === month);
      let holidayNote = '';
      if (monthHolidays.length > 0) {
        holidayNote = document.createElement('p');
        holidayNote.style.color = 'var(--muted)';
        holidayNote.style.fontSize = '12px';
        holidayNote.style.marginBottom = '8px';
        holidayNote.innerHTML = `⚠️ <strong>Holiday Notice:</strong> Pickup days may be pushed back 1 day due to holidays.`;
      }
      
      const grid = document.createElement('div');
      grid.className = 'calendar';
      buildCalendar(year, month, rule.weekday).forEach((d) => grid.appendChild(d));
      
      monthContainer.appendChild(monthTitle);
      if (holidayNote) monthContainer.appendChild(holidayNote);
      monthContainer.appendChild(grid);
      container.appendChild(monthContainer);
    }

    results.appendChild(container);
  }

  // Autocomplete functionality
  let selectedIndex = -1;
  let currentMatches = [];

  function showAutocomplete(matches) {
    currentMatches = matches;
    selectedIndex = -1;
    
    if (matches.length === 0) {
      autocompleteList.style.display = 'none';
      return;
    }

    autocompleteList.innerHTML = '';
    matches.slice(0, 8).forEach((match, index) => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.textContent = formatStreetName(match.street);
      item.addEventListener('click', () => selectStreet(match.street));
      autocompleteList.appendChild(item);
    });

    autocompleteList.style.display = 'block';
  }

  function selectStreet(streetName) {
    streetInput.value = formatStreetName(streetName);
    autocompleteList.style.display = 'none';
    renderCalendar(streetName);
  }

  function updateAutocomplete() {
    const query = streetInput.value.trim();
    
    if (query.length < 2) {
      autocompleteList.style.display = 'none';
      results.innerHTML = '';
      return;
    }

    const matches = getAllMatchingStreets(query);
    
    // If there's only one match, automatically select it and generate calendar
    if (matches.length === 1) {
      selectStreet(matches[0].street);
      return;
    }
    
    // If there are multiple matches, show autocomplete
    showAutocomplete(matches);
  }

  function handleKeydown(e) {
    if (autocompleteList.style.display === 'none') {
      if (e.key === 'Enter') {
        renderCalendar(streetInput.value);
      }
      return;
    }

    const items = autocompleteList.querySelectorAll('.autocomplete-item');
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        updateSelection();
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        updateSelection();
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && currentMatches[selectedIndex]) {
          selectStreet(currentMatches[selectedIndex].street);
        } else {
          renderCalendar(streetInput.value);
        }
        break;
      case 'Escape':
        autocompleteList.style.display = 'none';
        selectedIndex = -1;
        break;
    }
  }

  function updateSelection() {
    const items = autocompleteList.querySelectorAll('.autocomplete-item');
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === selectedIndex);
    });
  }

  // Initialize the app
  loadStreetSchedule().then(() => {
    streetInput.addEventListener('input', updateAutocomplete);
    streetInput.addEventListener('keydown', handleKeydown);
    
    // Hide autocomplete when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.autocomplete-container')) {
        autocompleteList.style.display = 'none';
      }
    });
  });
})();


