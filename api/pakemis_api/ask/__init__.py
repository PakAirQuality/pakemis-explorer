"""Ask PakEmis: a conversational agent over the eleven typed query functions.

The agent never computes a number. Every tool call goes through Service.run (the locked
chokepoint), every number in its prose is a server-rendered placeholder over an envelope of this
turn, and every typed refusal is reported by name. The model is injectable (ModelClient), so the
whole loop is tested with a scripted fake and no live call.
"""
