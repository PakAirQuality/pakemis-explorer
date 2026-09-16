from __future__ import annotations
import re
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')

class ViewContext(StrictModel):
    release_id: str = Field(default='1.0.0rc54', max_length=48, pattern=r'^[A-Za-z0-9._-]+$')
    view: Literal['learn','overview','explore','map','analyze','methods'] = 'learn'
    boundary: Literal['ipcc','module','economic'] = 'ipcc'
    sector: Literal['all','agriculture','power','transport','waste','residential','fugitives','ippu','industry','railways','aviation'] = 'all'
    category_id: str | None = Field(default=None, max_length=80, pattern=r'^[A-Za-z0-9._:/-]+$')
    metric: Literal['CO2e','CO2','CH4','N2O','NH3','NOx','NO2','SO2','CO','PM2.5','PM10','BC','NMVOC','O3','HFCs','SF6'] = 'CO2e'
    gwp: Literal['AR5','AR6'] = 'AR5'
    geography_id: str = Field(default='PK', max_length=80, pattern=r'^[A-Za-z0-9._:/-]+$')
    start_period: str = 'FY2023-24'
    end_period: str = 'FY2023-24'
    month: int | None = Field(default=None, ge=1, le=12)
    configuration: str = Field(default='L', max_length=120, pattern=r'^[A-Za-z0-9._-]+$')
    spatial_view: Literal['physical','origin','accounting','combined'] = 'combined'
    stream_id: str | None = Field(default=None, max_length=120, pattern=r'^[A-Za-z0-9._:/-]+$')
    language: Literal['en'] = 'en'

    @field_validator('start_period','end_period')
    @classmethod
    def fiscal_period(cls, value: str) -> str:
        m = re.fullmatch(r'FY(\d{4})-(\d{2})', value)
        if not m or int(m[2]) != (int(m[1])+1) % 100:
            raise ValueError('Use a consecutive July–June fiscal period, e.g. FY2023-24.')
        return value

    @model_validator(mode='after')
    def order(self):
        if int(self.start_period[2:6]) > int(self.end_period[2:6]):
            raise ValueError('The start period must not follow the end period.')
        return self

class AskRequest(StrictModel):
    question: str = Field(default='', max_length=1500)
    card_id: str | None = Field(default=None, max_length=80, pattern=r'^[a-z0-9_]+$')
    depth: Literal['simple','detail'] = 'simple'
    context: ViewContext = Field(default_factory=ViewContext)
    last_card_id: str | None = Field(default=None, max_length=80, pattern=r'^[a-z0-9_]+$')
    allow_external_model: bool = False

    @model_validator(mode='after')
    def not_empty(self):
        self.question = self.question.strip()
        if not self.question and not self.card_id:
            raise ValueError('Provide a question or a known explanation card.')
        return self

class CitationRef(StrictModel):
    source_id: str
    pages: list[int] = Field(default_factory=list, max_length=8)

class EngineAnswer(StrictModel):
    """Pre-rendered by the inventory adapter; never authored by the language model."""
    context: ViewContext
    operation: Literal['value','pattern','uncertainty','provenance','coverage']
    title: str = Field(min_length=1, max_length=180)
    paragraphs: list[str] = Field(min_length=1, max_length=6)
    citations: list[CitationRef] = Field(min_length=1, max_length=12)
    limitations: list[str] = Field(min_length=1, max_length=12)
    result_kind: Literal['reported_estimate','scenario','unavailable','unestimated','observed_activity']
    query_receipt: str = Field(min_length=1, max_length=240)
    # Values, units, identifiers and source URLs must come from the trusted export.
    # No request-supplied paragraph, figure or citation can enter this model.
