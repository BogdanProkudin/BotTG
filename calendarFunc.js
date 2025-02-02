export default function createCalendar(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  const calendar = [];
  let row = weekDays.map((day) => ({ text: day, callback_data: "noop" }));
  calendar.push(row);

  row = new Array(firstDay === 0 ? 6 : firstDay - 1).fill({
    text: " ",
    callback_data: "noop",
  });

  for (let day = 1; day <= daysInMonth; day++) {
    row.push({
      text: day.toString(),
      callback_data: `select_${year}-${month + 1}-${day}`,
    });

    if (row.length === 7) {
      calendar.push(row);
      row = [];
    }
  }

  if (row.length > 0) {
    while (row.length < 7) row.push({ text: " ", callback_data: "noop" });
    calendar.push(row);
  }

  calendar.push([
    { text: "←", callback_data: `prev_${year}-${month}` },
    { text: "→", callback_data: `next_${year}-${month}` },
  ]);

  return { inline_keyboard: calendar };
}
