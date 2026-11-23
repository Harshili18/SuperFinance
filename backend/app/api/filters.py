from datetime import date, timedelta

from fastapi import Depends, Query

from app.deps import current_user
from app.models import User
from app.services.finance import Filters


def period_bounds(period: str, date_from: date | None, date_to: date | None) -> tuple[date | None, date | None]:
    today = date.today()
    if period == "custom":
        return date_from, date_to
    if period == "today":
        return today, today
    if period == "week":
        start = today - timedelta(days=today.weekday())
        return start, today
    if period == "month":
        return today.replace(day=1), today
    if period == "last_month":
        first = today.replace(day=1)
        end = first - timedelta(days=1)
        return end.replace(day=1), end
    if period == "quarter":
        q = (today.month - 1) // 3
        start = date(today.year, q * 3 + 1, 1)
        return start, today
    if period == "year":
        return date(today.year, 1, 1), today
    if period == "last_year":
        return date(today.year - 1, 1, 1), date(today.year - 1, 12, 31)
    return today.replace(day=1), today


def qfilters(
    user: User = Depends(current_user),
    period: str = Query("month"),
    date_from: date | None = None,
    date_to: date | None = None,
    city_id: str | None = None,
    client_id: str | None = None,
    camp_id: str | None = None,
    package_id: str | None = None,
    channel: str | None = None,
    business_model: str | None = None,
    diagnostic_partner_id: str | None = None,
) -> Filters:
    df, dt = period_bounds(period, date_from, date_to)
    return Filters(
        org_id=user.org_id,
        date_from=df,
        date_to=dt,
        city_id=city_id,
        client_id=client_id,
        camp_id=camp_id,
        package_id=package_id,
        channel=channel,
        business_model=business_model,
        diagnostic_partner_id=diagnostic_partner_id,
    )
