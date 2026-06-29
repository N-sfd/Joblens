from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Employee, EmployeeCreate, EmployeeUpdate, EmployeeResponse
from ats_auth import get_current_ats_user

router = APIRouter()


@router.post("/", response_model=EmployeeResponse, status_code=201)
async def create_employee(
    body: EmployeeCreate,
    _: None = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    employee = Employee(**body.model_dump())
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


@router.get("/", response_model=list[EmployeeResponse])
async def list_employees(
    _: None = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    return db.query(Employee).order_by(Employee.created_at.desc()).all()


@router.get("/{employee_id}", response_model=EmployeeResponse)
async def get_employee(
    employee_id: int,
    _: None = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")
    return employee


@router.put("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: int,
    body: EmployeeUpdate,
    _: None = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(employee, key, value)
    db.commit()
    db.refresh(employee)
    return employee


@router.delete("/{employee_id}")
async def delete_employee(
    employee_id: int,
    _: None = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")
    db.delete(employee)
    db.commit()
    return {"message": "Employee deleted."}
